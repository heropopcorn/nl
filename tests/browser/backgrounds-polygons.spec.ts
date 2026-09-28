import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
async function pixelImage(page: Page) { return page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL()); }
async function loaded(page: Page) { await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false'); }
async function logicalClick(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('影棚预览').boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 720);
  await page.mouse.click(box.x + (box.width - 1280 * scale) / 2 + (100 + x * 720 / 1024) * scale, box.y + (box.height - 720 * scale) / 2 + (720 - y * 720 / 1024) * scale);
}
test('season switching preserves editing state, routes and view; missing quality is disabled', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const before = await pixelImage(page);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0]);
  await expect(page.getByLabel('背景分辨率').locator('option[value="x2"]')).toHaveJSProperty('disabled', true);
  await expect(page.getByLabel('背景分辨率').locator('option[value="x4"]')).toHaveJSProperty('disabled', true);
  await page.getByLabel('背景时节', { exact: true }).selectOption('winter_mid'); await loaded(page);
  await expect.poll(async () => (await pixelImage(page)) !== before).toBe(true);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0]);
  expect(after.actors).toEqual(original.actors); expect(after.season).toBe('winter_mid');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); await loaded(page);
  await expect.poll(async () => (await pixelImage(page)) === before).toBe(true);
  await page.getByRole('button', { name: '重做', exact: true }).click(); await loaded(page);
  await page.screenshot({ path: 'test-results/winter-background.png', fullPage: true });
  await page.reload(); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await loaded(page);
  await expect(page.getByLabel('背景时节', { exact: true })).toHaveValue('winter_mid');
});

test('resolution labels use actual dimensions and do not mutate document coordinates', async ({ page }) => {
  const manifest = JSON.parse(await readFile('apps/director-web/public/assets.json', 'utf8'));
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 768; c.height = 512; const ctx = c.getContext('2d')!; ctx.fillStyle = '#475e76'; ctx.fillRect(0, 0, 768, 512); return c.toDataURL().split(',')[1]; });
  manifest.protagonist_village.x2 = manifest.protagonist_village.default;
  manifest.protagonist_village.x4 = { url: '/art/test_small.png', width: 768, height: 512 };
  await page.route('**/assets.json', route => route.fulfill({ json: manifest }));
  await page.route('**/art/test_small.png', route => route.fulfill({ body: Buffer.from(png, 'base64'), contentType: 'image/png' }));
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const before = await pixelImage(page);
  const data = await page.evaluate(() => localStorage.getItem('yuanli.web-director.v1'));
  await page.getByLabel('背景分辨率').selectOption('x2'); await loaded(page);
  expect((await pixelImage(page)) === before).toBe(true);
  await page.getByLabel('背景分辨率').selectOption('x4'); await loaded(page);
  await expect.poll(async () => (await pixelImage(page)) !== before).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('yuanli.web-director.v1'))).toBe(data);
  await expect(page.getByLabel('背景分辨率').locator('option:checked')).toHaveText('x4 · 768×512');
  const output = await pixelImage(page), pending = page.waitForEvent('download');
  await page.getByRole('button',{name:'保存当前帧 PNG'}).click();
  expect((await readFile((await(await pending).path())!)).toString('base64')).toBe(output.split(',')[1]);
  await page.getByLabel('背景时节', { exact: true }).selectOption('spring_early'); await loaded(page);
  await expect(page.getByLabel('背景分辨率')).toHaveValue('default');
});

test('draw polygon across middle-button pan, keep tool active, save and export without guides', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await page.getByLabel('添加环境元素').selectOption('water');
  await page.getByRole('button', { name: '重绘区域 1', exact: true }).click();
  await logicalClick(page, 500, 350); await logicalClick(page, 950, 350);
  const box = (await page.locator('.viewport').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 100); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + 240, box.y + 120); await page.mouse.up({ button: 'middle' });
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(2);
  await logicalClick(page, 650, 650);
  await page.getByRole('button', { name: '闭合范围' }).click();
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
  const region = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects[0].regions[0]);
  expect(region.points).toHaveLength(3); expect(region.points[0].x).toBeCloseTo(500, -1); expect(region.points[2].y).toBeCloseTo(650, -1);
  await page.getByRole('button',{name:'移动 V',exact:true}).click();
  await page.getByLabel('speed',{exact:true}).fill('0');
  const before = await pixelImage(page), pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存当前帧 PNG' }).click();
  expect((await readFile((await (await pending).path())!)).toString('base64') === before.split(',')[1]).toBe(true);
  await page.getByRole('button', { name: '适应画布' }).click();
  await page.screenshot({ path: 'test-results/polygon-water.png', fullPage: true });
  await page.reload(); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects[0].regions[0]);
  expect(restored).toEqual(region);
});

test('late asset loads cannot overwrite the latest season; failed assets block export', async ({ page }) => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/art/protagonist_village_winter_mid.png', async route => { entered(); await held; await route.continue(); });
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await page.getByLabel('背景时节', { exact: true }).selectOption('winter_mid');
  await requested;
  await expect(page.getByRole('button', { name: '保存当前帧 PNG' })).toBeDisabled();
  await page.getByLabel('背景时节', { exact: true }).selectOption('summer_early'); await loaded(page);
  const summer = await pixelImage(page);
  const finished = page.waitForResponse('**/art/protagonist_village_winter_mid.png'); release(); await finished;
  await page.waitForTimeout(300);
  expect((await pixelImage(page)) === summer).toBe(true);
  await page.route('**/art/protagonist_village_autumn_mid.png', route => route.abort());
  await page.getByLabel('背景时节', { exact: true }).selectOption('autumn_mid');
  await expect(page.getByRole('status')).toContainText('渲染失败');
  await expect(page.getByRole('button', { name: '保存当前帧 PNG' })).toBeDisabled();
  await page.getByLabel('背景时节', { exact: true }).selectOption('summer_early'); await loaded(page);
  expect((await pixelImage(page)) === summer).toBe(true);
});

test('polygon clip restores background only inside triangle, not its whole bounding box', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const result = await page.evaluate(async url => {
    const { compositeEnvironment } = await import(`${url}/packages/studios/environment.ts`);
    const { sample, effectSchema } = await import(`${url}/packages/core/index.ts`);
    const shot = structuredClone(sample.shots[0]); shot.actors = []; shot.lighting.time = 'noon';
    shot.effects = [effectSchema.parse({ id: 'triangle', name: 'triangle', type: 'cutout', regions: [{ x: 200, y: 200, width: 800, height: 600, points: [{ x: 200, y: 200 }, { x: 1000, y: 200 }, { x: 200, y: 800 }] }] })];
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1280, 720);
    const bg = document.createElement('canvas'); bg.width = 1280; bg.height = 720;
    const b = bg.getContext('2d')!; b.fillStyle = '#0000ff'; b.fillRect(0, 0, 1280, 720);
    compositeEnvironment(ctx, shot, 0, new Image(), bg);
    return { inside: Array.from(ctx.getImageData(311, 509, 1, 1).data), outside: Array.from(ctx.getImageData(733, 228, 1, 1).data) };
  }, `/@fs/${process.cwd()}`);
  expect(result.inside).toEqual([0, 0, 255, 255]); expect(result.outside).toEqual([255, 0, 0, 255]);
});
