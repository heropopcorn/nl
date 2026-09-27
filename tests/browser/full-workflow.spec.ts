import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sample, effectSchema, shotSchema } from '../../packages/core';
const exec = promisify(execFile);
async function coordinates(page: Page, x: number, y: number) { const b = (await page.getByLabel('影棚预览').boundingBox())!, s = Math.min(b.width / 1280, b.height / 720); return { x: b.x + (b.width - 1280*s)/2 + (100+x*720/1024)*s, y: b.y + (b.height - 720*s)/2 + (720-y*720/1024)*s }; }
async function start(page: Page) { await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy','false'); }
test('image drag, one-step undo, scale, rotation, route editing and collision', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '♙ 主角（占位贴图）' }).click();
  const begin = await coordinates(page,460,330), end = await coordinates(page,560,430);
  await page.mouse.move(begin.x,begin.y); await page.mouse.down(); await page.mouse.move(end.x,end.y,{steps:4}); await page.mouse.up();
  let actor = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0]);
  expect(actor.start.x).toBeCloseTo(560,0); expect(actor.start.y).toBeCloseTo(400,0);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  actor = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0]); expect(actor.start.x).toBe(460);
  await page.getByRole('button',{name:'画路线',exact:true}).click();
  for(const p of [[700,300],[900,450]]) { const c=await coordinates(page,p[0],p[1]); await page.mouse.click(c.x,c.y); }
  await page.getByRole('button',{name:'完成线段'}).click();
  actor = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0]); expect(actor.route).toHaveLength(3);
  await page.getByLabel('缩放比例',{exact:true}).fill('1.5'); await page.getByLabel('旋转角度',{exact:true}).fill('30');
  await page.getByRole('button',{name:'镜像',exact:true}).click();
  actor = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0]); expect(actor).toMatchObject({scale:1.5,rotation:30,flipX:true});
});
test('custom resource upload and IndexedDB persistence', async ({ page }) => {
  await start(page); await page.getByRole('button',{name:'自定义资源',exact:true}).click();
  await page.getByLabel('资源分类').selectOption('characters');
  const data = await page.evaluate(() => { const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d')!;x.fillStyle='red';x.fillRect(0,0,32,32);x.fillStyle='blue';x.fillRect(32,0,32,32);return c.toDataURL().split(',')[1]; });
  await page.getByLabel('上传自定义资源').setInputFiles({name:'角色序列.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  await expect(page.getByRole('button',{name:'角色序列.png'})).toBeVisible(); await page.getByLabel('帧列',{exact:true}).fill('2');
  await page.getByRole('button',{name:'角色序列.png'}).click(); await expect(page.getByRole('button',{name:'♙ 角色序列.png'})).toBeVisible();
  await page.reload(); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await expect(page.getByRole('button',{name:'♙ 角色序列.png'})).toBeVisible();
  const stored=await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!)); expect(stored.assets[0].columns).toBe(2);
});
test('three studios export a complete MP4 with AAC audio', async ({ page }) => {
  test.setTimeout(120000);
  const p=structuredClone(sample);p.shots[0].frames=2;p.shots[1]=shotSchema.parse({...p.shots[1],studio:'motion',frames:2});p.shots[2]=shotSchema.parse({...p.shots[2],studio:'three',frames:2,objects3d:[{id:'cube',name:'Cube',shape:'box',spin:30}]});
  const wav=Buffer.alloc(44+48000*2); wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<48000;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/48000)*2000),44+i*2);
  p.assets.push({id:'audio',name:'Tone',category:'audio',src:`data:audio/wav;base64,${wav.toString('base64')}`,width:1,height:1,columns:1,rows:1,fps:12});p.audioTracks.push({id:'track',name:'Tone',assetId:'audio',startFrame:0,offsetFrame:0,frames:6,volume:0.5,muted:false});
  await page.addInitScript(p=>localStorage.setItem('yuanli.web-director.v1',JSON.stringify(p)),p); await start(page);
  await page.getByLabel('时间轴',{exact:true}).fill('4');await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy','false');
  await page.screenshot({path:'test-results/three-studio.png',fullPage:true});
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出 MP4 视频（含音轨）'}).click();const file=await (await pending).path();
  const result=JSON.parse((await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file!])).stdout);
  expect(result.streams.find((s:any)=>s.codec_type==='video')).toMatchObject({codec_name:'h264',width:1280,height:720,nb_frames:'6'});
  expect(result.streams.find((s:any)=>s.codec_type==='audio').codec_name).toBe('aac');
  expect(Number(result.format.duration)).toBeCloseTo(0.2,1);
});
test('chapters, scenes and immutable scene-set snapshots',async({page})=>{
  await start(page);page.on('dialog',d=>d.accept('新章节'));
  await page.getByRole('button',{name:'新建章节',exact:true}).click();await expect(page.locator('.project-tree summary').filter({hasText:'新章节'})).toBeVisible();
  await page.getByRole('button',{name:'保存布景版本'}).click();
  const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('yuanli.web-director.v1')!));expect(p.sets).toHaveLength(1);
  await page.getByLabel('镜头名称',{exact:true}).fill('改名');const changed=await page.evaluate(()=>JSON.parse(localStorage.getItem('yuanli.web-director.v1')!));expect(changed.sets[0].content.name).not.toBe('改名');
});
