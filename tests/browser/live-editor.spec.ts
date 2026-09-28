import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) { await page.goto('/'); await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false'); await expect(page.locator('footer')).toContainText('影棚已就绪'); }
async function project(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!)); }
async function point(page: Page, x: number, y: number) { const b = (await page.getByLabel('影棚预览').boundingBox())!, s = Math.min(b.width / 1280, b.height / 720); return { x: b.x + (b.width - 1280*s)/2 + (100 + x*720/1024)*s, y: b.y + (b.height - 720*s)/2 + (720-y*720/1024)*s }; }
async function click(page: Page, x: number, y: number) { const p = await point(page,x,y); await page.mouse.click(p.x,p.y); }
const pixels = (page: Page) => page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL());

test('show all region outlines allows direct subregion selection without changing geometry', async ({page}) => {
  await ready(page);
  const toggle = page.getByLabel('显示所有元素区域');
  await expect(toggle).not.toBeChecked();
  await page.getByLabel('添加环境元素').selectOption('fog');
  await page.getByRole('button', {name:'多边形套索',exact:true}).click();
  await click(page,300,300); await click(page,600,300); await click(page,450,500);
  await page.keyboard.press('Enter');
  await page.getByRole('button', {name:'移动 V',exact:true}).click();
  await page.getByRole('button', {name:'▧ 背景画布',exact:true}).click();
  await expect(page.getByLabel('选中范围辅助线').locator('polygon')).toHaveCount(0);
  await toggle.check();
  await expect(page.getByRole('button',{name:'选中 雾气 1 区域 2',exact:true})).toHaveCount(1);
  const before = await project(page);
  await click(page,450,300);
  await expect(page.getByLabel('环境名称')).toHaveValue('雾气 1');
  await expect(page.locator('.active-region')).toContainText('区域 2');
  expect((await project(page)).shots[0].effects).toEqual(before.shots[0].effects);
  await toggle.uncheck();
  await expect(page.getByLabel('选中范围辅助线').locator('polygon')).toHaveCount(2);
  await page.getByRole('button', {name:'▧ 背景画布',exact:true}).click();
  await expect(page.getByLabel('选中范围辅助线').locator('polygon')).toHaveCount(0);
});

test('no timeline or play controls; rain animates immediately without moving actors or view', async ({ page }) => {
  await ready(page);
  await expect(page.getByLabel('时间轴', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('时长（帧 / 30fps）')).toHaveCount(0);
  const before = await project(page), dry = await pixels(page);
  await page.getByLabel('视图', { exact: true }).selectOption('1.5');
  const p = await point(page,600,400); await page.mouse.move(p.x,p.y); await page.mouse.down({button:'middle'}); await page.mouse.move(p.x+20,p.y+20); await page.mouse.up({button:'middle'});
  // Wait for React to commit the pan before taking the reference viewport state.
  await expect(page.locator('.canvas-stack')).toHaveAttribute('style', 'transform: translate(20px, 20px) scale(1.5);');
  const view = await page.locator('.canvas-stack').getAttribute('style');
  await page.getByLabel('添加环境元素').selectOption('rain');
  await expect.poll(() => pixels(page)).not.toBe(dry);
  const rain = await pixels(page); await expect.poll(() => pixels(page)).not.toBe(rain);
  await page.getByLabel('区域启用碰撞', {exact:true}).check();
  expect(await page.locator('.canvas-stack').getAttribute('style')).toBe(view);
  expect((await project(page)).shots[0].actors).toEqual(before.shots[0].actors);
  await page.getByLabel('隐藏环境元素 降雨 1', {exact:true}).click();
  await expect.poll(() => pixels(page)).toBe(dry);
  await page.getByLabel('显示环境元素 降雨 1', {exact:true}).click();
  await expect.poll(() => pixels(page)).not.toBe(dry);
  await page.getByLabel('删除环境元素 降雨 1', {exact:true}).click();
  await expect.poll(() => pixels(page)).toBe(dry);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.getByLabel('删除环境元素 降雨 1', {exact:true})).toBeVisible();
});

test('lightning is an independently addable live effect with no rain', async ({page}) => {
  await ready(page); const dry=await pixels(page);
  await page.getByLabel('添加环境元素').selectOption('lightning');
  await expect.poll(() => pixels(page), {timeout:8000, intervals:[50,100,200]}).not.toBe(dry);
  expect((await project(page)).shots[0].effects.map((e:any)=>e.type)).toEqual(['lightning']);
  await page.getByLabel('删除环境元素 雷电 1', {exact:true}).click();
  await expect.poll(() => pixels(page)).toBe(dry);
});

test('polygon lasso persists across release and pan; each region can be edited and removed including the last', async ({page}) => {
  await ready(page);
  // Fog keeps this test focused on interaction rather than shader compilation.
  await page.getByLabel('添加环境元素').selectOption('fog');
  await page.getByRole('button',{name:'多边形套索',exact:true}).click();
  await click(page,100,100); await click(page,350,100);
  expect((await project(page)).shots[0].effects[0].regions).toHaveLength(1);
  const pan=await point(page,500,500);await page.mouse.move(pan.x,pan.y);await page.mouse.down({button:'middle'});await page.mouse.move(pan.x+20,pan.y);await page.mouse.up({button:'middle'});
  await click(page,350,300); await page.keyboard.press('Backspace'); await click(page,330,280); await click(page,100,280);
  expect((await project(page)).shots[0].effects[0].regions).toHaveLength(1);
  await page.keyboard.press('Enter');
  await expect.poll(async()=> (await project(page)).shots[0].effects[0].regions.length).toBe(2);
  await expect(page.getByRole('button',{name:'多边形套索',exact:true})).toHaveClass(/active/);
  const original=(await project(page)).shots[0].effects[0].regions[0];
  await page.getByRole('button',{name:'选中区域 2',exact:true}).click();
  await page.getByLabel('范围2-x',{exact:true}).fill('140');
  expect((await project(page)).shots[0].effects[0].regions[0]).toEqual(original);
  expect((await project(page)).shots[0].effects[0].regions[1].points[0].x).toBeCloseTo(140);
  await page.getByRole('button',{name:'编辑区域 2 顶点',exact:true}).click();
  const a=await point(page,140,100),b=await point(page,160,120);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:3});await page.mouse.up();
  await expect.poll(async()=> (await project(page)).shots[0].effects[0].regions[1].points[0].x).toBeCloseTo(160,0);
  expect((await project(page)).shots[0].effects[0].regions[0]).toEqual(original);
  await page.getByRole('button',{name:'删除区域 2',exact:true}).click();
  await page.getByRole('button',{name:'删除区域 1',exact:true}).click();
  await expect(page.getByText('暂无区域，此元素暂不产生效果。请绘制新区域。')).toBeVisible();
  expect((await project(page)).shots[0].effects[0].regions).toEqual([]);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await expect(page.getByRole('button',{name:'删除区域 1',exact:true})).toBeVisible();
});

test('old water shader renders continuous flowing highlights and freezes at speed zero',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page); const dry=await pixels(page);
  await page.getByLabel('添加环境元素').selectOption('water');
  await expect.poll(()=>pixels(page),{timeout:15000}).not.toBe(dry);
  const water=await pixels(page);await expect.poll(()=>pixels(page),{timeout:15000}).not.toBe(water);
  await page.getByLabel('speed',{exact:true}).fill('0');
  await expect.poll(async()=>Number(await page.getByLabel('影棚预览').getAttribute('data-effect-frame'))).toBeGreaterThan(2);
  const frozen=await pixels(page); await page.waitForTimeout(250);expect(await pixels(page)).toBe(frozen);
  await page.getByRole('button',{name:'适应画布',exact:true}).click();
  await page.screenshot({path:'test-results/live-water-editor.png',fullPage:true});
  await page.getByLabel('speed',{exact:true}).fill('1');
  await expect.poll(()=>pixels(page)).not.toBe(frozen);
  await page.getByLabel('删除环境元素 水流 1',{exact:true}).click(); await expect.poll(()=>pixels(page)).toBe(dry);
  expect(errors).toEqual([]);
});

test('double click closes a polygon; cancelling or switching elements never commits a draft', async ({page}) => {
  await ready(page); await page.getByLabel('添加环境元素').selectOption('fog');
  await page.getByRole('button',{name:'多边形套索',exact:true}).click();
  await click(page,100,100); await click(page,350,100);
  const end=await point(page,200,350); await page.mouse.dblclick(end.x,end.y);
  await expect.poll(async()=> (await project(page)).shots[0].effects[0].regions.length).toBe(2);
  await click(page,500,500); await click(page,650,500); await page.keyboard.press('Escape');
  expect((await project(page)).shots[0].effects[0].regions).toHaveLength(2);
  await page.getByRole('button',{name:'重绘区域 2',exact:true}).click();
  await click(page,100,100); await click(page,200,100);
  await page.getByLabel('添加环境元素').selectOption('rain');
  await click(page,700,400); await click(page,900,400); await click(page,800,650); await page.keyboard.press('Enter');
  await expect.poll(async()=> (await project(page)).shots[0].effects[1].regions.length).toBe(2);
  expect((await project(page)).shots[0].effects[0].regions).toHaveLength(2);
  expect((await project(page)).shots[0].effects[1].regions[1].points).toHaveLength(3);
});
