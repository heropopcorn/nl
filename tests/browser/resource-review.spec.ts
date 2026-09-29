import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('resource confirmation previews local image/video/animation and reloads persisted cloud decisions',async({page})=>{
  const videoPath=test.info().outputPath('review.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=4:duration=1','-c:v','libvpx',videoPath]);
  const image=readFileSync('video_game/art/generated/player_placeholder.png'),video=readFileSync(videoPath);
  const gifPath=test.info().outputPath('review.gif');
  execFileSync('ffmpeg',['-v','error','-i',videoPath,'-loop','0',gifPath]);
  const gif=readFileSync(gifPath);
  const items=[{id:'a'.repeat(64),name:'人物.png',kind:'image',mime:'image/png',bytes:image.length,url:'/resource-review/media/'+'a'.repeat(64)+'.png'},
    {id:'b'.repeat(64),name:'动作.webm',kind:'video',mime:'video/webm',bytes:video.length,url:'/resource-review/media/'+'b'.repeat(64)+'.webm'},
    {id:'c'.repeat(64),name:'动图.gif',kind:'animation',mime:'image/gif',bytes:gif.length,url:'/resource-review/media/'+'c'.repeat(64)+'.gif'}];
  const rows=Object.fromEntries(items.map(a=>[a.id,{asset_id:a.id,status:'pending',note:'',revision:0,updated_at:new Date().toISOString()}]));
  await page.route('**/resource-review/manifest.json',route=>route.fulfill({json:{version:1,enabled:true,namespace:'nl-test',generatedAt:new Date().toISOString(),items}}));
  await page.route('**/resource-review/media/*',route=>{const a=items.find(a=>route.request().url().endsWith(a.url))!;return route.fulfill({contentType:a.mime,body:a.kind==='video'?video:a.kind==='animation'?gif:image});});
  let fail=false,conflict=false;
  await page.route('**/api/resource-review*',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:{namespace:'nl-test',rows:Object.values(rows),next:null}});
    if(fail)return route.fulfill({status:503,json:{error:'数据库暂时不可用'}});
    if(conflict)return route.fulfill({status:409,json:{error:'此资源已在其他窗口被修改，请刷新云端状态后重试'}});
    const input=route.request().postDataJSON(),row=rows[input.id];
    expect(input.namespace).toBe('nl-test');expect(input.revision).toBe(row.revision);
    Object.assign(row,{status:input.status,note:input.note,revision:row.revision+1});
    return route.fulfill({json:{namespace:'nl-test',row}});
  });
  await page.goto('/');await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('button',{name:'资源确认',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'资源确认',exact:true});
  await expect(dialog.getByRole('button',{name:/^查看 /})).toHaveCount(3);
  await expect(dialog.getByRole('img',{name:'资源大图 人物.png'})).toBeVisible();
  await dialog.getByLabel('确认备注').fill('可作为村庄人物');await dialog.getByRole('button',{name:'标记可用',exact:true}).click();
  await expect(dialog.getByLabel('资源确认状态')).toContainText('已保存到云端');
  expect(rows[items[0].id].status).toBe('usable');
  await dialog.getByRole('button',{name:'查看 动作.webm',exact:true}).click();
  const player=dialog.getByLabel('待确认视频');await expect(player).toBeVisible();
  await expect.poll(()=>player.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThan(0);
  await player.evaluate((v:HTMLVideoElement)=>v.play());
  await dialog.getByLabel('确认备注').fill('动作不连续，归档');await dialog.getByRole('button',{name:'标记不可用',exact:true}).click();
  await expect(dialog.getByLabel('资源确认状态')).toContainText('动作.webm → 不可用');
  await dialog.getByRole('button',{name:'查看 动图.gif',exact:true}).click();await expect(dialog.getByRole('img',{name:'资源大图 动图.gif'})).toBeVisible();
  await page.screenshot({path:'test-results/resource-review.png'});
  await dialog.getByLabel('关闭资源浏览器').click();await page.reload();await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('button',{name:'资源确认',exact:true}).click();dialog=page.getByRole('dialog',{name:'资源确认',exact:true});
  await expect(dialog.getByRole('button',{name:/^查看 /})).toHaveCount(1);
  await dialog.getByLabel('确认状态',{exact:true}).selectOption('usable');await dialog.getByRole('button',{name:'查看 人物.png',exact:true}).click();
  await expect(dialog.getByLabel('确认备注')).toHaveValue('可作为村庄人物');
  await dialog.getByLabel('确认备注').fill('保留新备注');fail=true;
  await dialog.getByRole('button',{name:'标记不可用',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('数据库暂时不可用');
  expect(rows[items[0].id].status).toBe('usable');await expect(dialog.getByLabel('确认备注')).toHaveValue('保留新备注');
  fail=false;page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'刷新云端状态',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'标记可用',exact:true})).toBeEnabled();
  conflict=true;await dialog.getByRole('button',{name:'标记不可用',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('其他窗口');
  expect(rows[items[0].id].status).toBe('usable');
});

test('disabled review module never calls a database or pretends to save locally',async({page})=>{
  await page.route('**/resource-review/manifest.json',r=>r.fulfill({json:{version:1,enabled:false,namespace:null,generatedAt:'test',items:[]}}));
  let calls=0;page.on('request',r=>{if(r.url().includes('/api/resource-review'))calls++;});
  await page.goto('/');await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('button',{name:'资源确认',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'资源确认',exact:true});
  await expect(dialog).toContainText('资源确认尚未启用');expect(calls).toBe(0);
  await expect(dialog.getByRole('button',{name:'标记可用',exact:true})).toHaveCount(0);
});
