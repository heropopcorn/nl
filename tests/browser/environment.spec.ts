import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { sample, effectSchema } from '../../packages/core';

test('weather controls preserve viewport, undo, save and snapshot export', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await page.getByLabel('视图', { exact: true }).selectOption('1.5');
  const area = page.locator('.viewport'); const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + 250, box.y + 120); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + 300, box.y + 150); await page.mouse.up({ button: 'middle' });
  const transform = await page.locator('.canvas-stack').getAttribute('style');
  const canvas = page.getByLabel('影棚预览');
  const dry = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByLabel('添加环境元素').selectOption('rain');
  await page.getByLabel('环境名称').fill('房前雨水');
  await page.getByLabel('speed',{exact:true}).fill('0');
  const rain = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()); expect(rain).not.toBe(dry);
  await page.getByLabel('启用环境元素').uncheck();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(dry);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(rain);
  expect(await page.locator('.canvas-stack').getAttribute('style')).toBe(transform);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'保存当前帧 PNG'}).click();
  expect((await readFile((await(await pending).path())!)).toString('base64')).toBe(rain.split(',')[1]);
  await page.getByRole('button', { name: '适应画布' }).click();
  await page.screenshot({ path: 'test-results/weather-rain.png', fullPage: true });
  await page.reload(); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await expect(page.getByRole('button', { name: '◉ 房前雨水' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('snow fog water and night alter pixels; zero intensity restores scene', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const canvas = page.getByLabel('影棚预览');
  const dry = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  for (const type of ['snow', 'fog', 'water']) {
    await page.getByLabel('添加环境元素').selectOption(type);
    const visible = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()); expect(visible).not.toBe(dry);
    await page.getByLabel('intensity', { exact: true }).fill('0');
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(dry);
    await page.getByRole('button', { name: '删除当前环境元素', exact:true }).click();
  }
  await page.getByLabel('时段', { exact: true }).selectOption('night');
  const moon = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()); expect(moon).not.toBe(dry);
  await page.getByLabel('月光强度').fill('0');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(moon);
  await page.getByLabel('时段', { exact: true }).selectOption('noon');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(dry);
});

test('background cutout actually occludes low-layer rain and custom line changes actor depth', async ({ page }) => {
  const project = structuredClone(sample); project.shots[0].actors = [];
  project.shots[0].effects = [effectSchema.parse({ id: 'rain', name: '测试雨', type: 'rain', layer: 0, regions: [{ x: 0, y: 0, width: 1536, height: 1024 }] }), effectSchema.parse({ id: 'roof', name: '测试遮挡块', type: 'cutout', layer: 1, regions: [{ x: 0, y: 0, width: 1536, height: 1024 }] })];
  await page.addInitScript(p => localStorage.setItem('yuanli.web-director.v1', JSON.stringify(p)), project);
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const canvas = page.getByLabel('影棚预览');
  const hidden = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole('button', { name: '◉ 测试雨' }).click();
  await page.getByLabel('启用环境元素').uncheck();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(hidden);
  await page.getByLabel('启用环境元素').check(); await page.getByLabel('环境层级').fill('2');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(hidden);
  // Isolated synthetic images give unambiguous pixel checks for the shared compositor.
  const result = await page.evaluate(async ({ url, project }) => {
    const { compositeEnvironment } = await import(url);
    const output = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    const ctx = output.getContext('2d')!;
    async function solid(color: string) { const c = document.createElement('canvas'); c.width = c.height = 10; const x = c.getContext('2d')!; x.fillStyle = color; x.fillRect(0, 0, 10, 10); const img = new Image(); img.src = c.toDataURL(); await img.decode(); return img; }
    const player = await solid('#ff0000'), bg = await solid('#0000ff');
    const shot = project.shots[0]; shot.effects = shot.effects.filter(e => e.type === 'cutout'); shot.effects[0].layer = 0;
    shot.actors = [{ ...project.shots[1].actors[0], id: 'a', name: 'a', start: { x: 700, y: 400 }, end: { x: 700, y: 400 }, layer: 0 }];
    const pixel = () => Array.from(ctx.getImageData(592, 410, 1, 1).data);
    shot.effects[0].sortY = 600; compositeEnvironment(ctx, shot, 0, player, bg); const front = pixel();
    ctx.clearRect(0, 0, 1280, 720); shot.effects[0].sortY = 200; compositeEnvironment(ctx, shot, 0, player, bg);
    return { front, back: pixel() };
  }, { url: `/@fs/${process.cwd()}/packages/studios/environment.ts`, project });
  expect(result.front).toEqual([255, 0, 0, 255]); expect(result.back).toEqual([0, 0, 255, 255]);
});
