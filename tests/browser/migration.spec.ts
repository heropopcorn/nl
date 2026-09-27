import { test, expect, type Page } from '@playwright/test';
async function loaded(page: Page) { await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false'); }
async function logical(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('影棚预览').boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 720);
  return { x: box.x + (box.width - 1280 * scale) / 2 + (100 + x * 720 / 1024) * scale, y: box.y + (box.height - 720 * scale) / 2 + (720 - y * 720 / 1024) * scale };
}
test('blank canvas, rain density, wind direction and chapter order', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await loaded(page);
  const before = await page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole('button', { name: '空白画布' }).click(); await loaded(page);
  expect(await page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].blank)).toBe(true);
  await page.getByRole('button', { name: '恢复背景图片' }).click(); await loaded(page);
  await page.getByLabel('添加环境元素').selectOption('rain');
  await page.getByLabel('雨水密度').fill('0.2');
  await page.getByLabel('全局风向').selectOption('left');
  await page.getByLabel('启用风').check();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0]);
  expect(stored.effects[0].density).toBeCloseTo(0.2);
  expect(stored.wind.direction.x).toBeCloseTo(-1);
  expect(stored.wind.enabled).toBe(true);
  page.on('dialog', dialog => dialog.accept('第二章'));
  await page.getByRole('button', { name: '新建章节', exact: true }).click();
  await page.getByLabel('下移章节 第一章').click();
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).chapters.map((c: { name: string }) => c.name));
  expect(names[0]).toBe('第二章');
});
test('freehand lasso and vertex drag edit a water region', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await loaded(page);
  await page.getByLabel('添加环境元素').selectOption('water');
  await page.getByRole('button', { name: '自由套索', exact: true }).click();
  const path = [[80, 700], [380, 700], [380, 920], [80, 920], [90, 710]];
  const start = await logical(page, path[0][0], path[0][1]);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const [x, y] of path.slice(1)) { const point = await logical(page, x, y); await page.mouse.move(point.x, point.y, { steps: 8 }); }
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects[0].regions.length)).toBe(2);
  await page.getByRole('button', { name: '顶点', exact: true }).click();
  const corner = await logical(page, 900, 550);
  const next = await logical(page, 1040, 680);
  await page.mouse.move(corner.x, corner.y); await page.mouse.down(); await page.mouse.move(next.x, next.y, { steps: 4 }); await page.mouse.up();
  const region = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects[0].regions[0]);
  expect(region.points.some((p: { x: number; y: number }) => Math.hypot(p.x - 1040, p.y - 680) < 30)).toBe(true);
});
test('overlapping water blocks save and playback; WASD does not rewrite the route', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await loaded(page);
  await expect(page.getByRole('img', { name: '初识元力 缩略图' })).toBeVisible();
  const start = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0].start);
  await page.getByRole('button', { name: /主角/ }).click();
  const before = await page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  await expect(page.getByRole('status')).toContainText('不会改路线');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].actors[0].start)).toEqual(start);
  expect(await page.getByLabel('影棚预览').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(before);
  await page.getByLabel('添加环境元素').selectOption('water');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects.length)).toBe(1);
  await page.getByLabel('添加环境元素').selectOption('water');
  await expect(page.getByRole('status')).toContainText('水域不能重叠');
  await expect(page.getByRole('button', { name: '播放' })).toBeDisabled();
  await expect(page.getByLabel('重叠水域')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].effects.length)).toBe(1);
  await page.getByRole('button', { name: '删除环境元素' }).click();
  await expect(page.getByRole('button', { name: '播放' })).toBeEnabled();
});
