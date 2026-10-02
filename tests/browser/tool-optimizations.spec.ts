import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
}
const project = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!));
async function point(page: Page, x: number, y: number) {
  const b = (await page.getByLabel('影棚预览').boundingBox())!, scale = Math.min(b.width / 1280, b.height / 720);
  return { x: b.x + (b.width - 1280 * scale) / 2 + (100 + x * 720 / 1024) * scale, y: b.y + (b.height - 720 * scale) / 2 + (720 - y * 720 / 1024) * scale };
}
async function click(page: Page, x: number, y: number) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); }
async function precisePoint(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  // Native mouse automation rounds CSS coordinates on WebKit. DOM pointer events
  // retain fractions so this schema-boundary test does not depend on that rounding.
  const event = { pointerId: 1, pointerType: 'mouse', clientX: p.x, clientY: p.y, button: 0 };
  await page.locator('.viewport').dispatchEvent('pointerdown', { ...event, buttons: 1 });
  await page.locator('.viewport').dispatchEvent('pointerup', { ...event, buttons: 0 });
}
async function dragStart(page: Page) {
  const a = await point(page, 460, 330), b = await point(page, 560, 430);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 });
}

test('tools explain their target requirements, while region scale and rotation remain available', async ({ page }) => {
  await ready(page);
  const scale = page.getByRole('button', { name: '缩放', exact: true }), rotate = page.getByRole('button', { name: '旋转', exact: true });
  await expect(scale).toBeDisabled(); await expect(scale).toHaveAttribute('title', /先选中/);
  await expect(page.getByRole('button', { name: '多边形套索', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '♙ 主角（占位贴图）', exact: true }).click();
  await expect(scale).toBeEnabled(); await expect(rotate).toBeEnabled();
  await scale.click(); await expect(scale).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('footer')).toContainText('四角');
  await expect(page.getByRole('button', { name: '水流导线', exact: true })).toBeDisabled();
  await page.getByLabel('添加环境元素').selectOption('fog');
  await expect(scale).toBeEnabled(); await expect(rotate).toBeEnabled();
  await rotate.click(); await expect(rotate).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('footer')).toContainText('区域中心');
  await page.getByLabel('添加环境元素').selectOption('lightning');
  await expect(scale).toBeDisabled(); await expect(rotate).toBeDisabled();
  await expect(page.getByRole('button', { name: '移动 V', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('one-point flow drafts survive completion and can be extended into a valid flow line', async ({ page }) => {
  await ready(page); await page.getByLabel('添加环境元素').selectOption('water');
  await page.getByRole('button', { name: '水流导线', exact: true }).click();
  await click(page, 550, 400); await page.getByRole('button', { name: '完成线段', exact: true }).click();
  await expect(page.locator('footer')).toContainText('至少需要两个点');
  await expect(page.getByRole('button', { name: '完成线段', exact: true })).toBeVisible();
  expect((await project(page)).shots[0].effects[0].flowLines).toHaveLength(0);
  await click(page, 800, 450); await page.getByRole('button', { name: '完成线段', exact: true }).click();
  await expect.poll(async () => (await project(page)).shots[0].effects[0].flowLines[0]?.length).toBe(2);
  await expect(page.getByRole('button', { name: '完成线段', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '水流导线', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('schema-rejected polygon drafts stay editable instead of reporting success or disappearing', async ({ page }) => {
  await ready(page); await page.getByLabel('添加环境元素').selectOption('fog');
  await page.getByRole('button', { name: '多边形套索', exact: true }).click();
  // Valid non-self-intersecting polygon, but its sub-pixel width violates the
  // persisted region schema. Exercise change() rejection rather than lasso checks.
  await precisePoint(page, 600, 200); await precisePoint(page, 600.5, 600); await precisePoint(page, 600, 900);
  const draftWidth = await page.getByLabel('多边形草稿').locator('circle').evaluateAll(circles => {
    const xs = circles.map(circle => Number(circle.getAttribute('cx')));
    return (Math.max(...xs) - Math.min(...xs)) * 1024 / 720;
  });
  expect(draftWidth).toBeCloseTo(0.5, 2);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect(page.locator('footer')).toContainText('参数未应用');
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(3);
  expect((await project(page)).shots[0].effects[0].regions).toHaveLength(1);
  await page.getByRole('button', { name: '撤销顶点', exact: true }).click();
  await click(page, 900, 700); await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await project(page)).shots[0].effects[0].regions.length).toBe(2);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
});

test('drag commits retain concurrent property edits and reject geometry conflicts', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '♙ 主角（占位贴图）', exact: true }).click();
  const original = (await project(page)).shots[0].actors[0].start;
  await dragStart(page);
  await page.getByLabel('元素名称', { exact: true }).fill('拖动时改名');
  await page.getByLabel('布景名称', { exact: true }).fill('拖动时更新布景');
  await page.mouse.up();
  // One rounded CSS pixel maps to roughly two logical pixels at this viewport.
  // Both axes must still move the requested ~100 logical pixels.
  for (const axis of ['x', 'y']) await expect.poll(async () => Math.abs((await project(page)).shots[0].actors[0].start[axis] - original[axis] - 100)).toBeLessThanOrEqual(3);
  let stored = (await project(page)).shots[0];
  expect(stored.name).toBe('拖动时更新布景'); expect(stored.actors[0].name).toBe('拖动时改名');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await project(page)).shots[0].actors[0].start.x).toBe(460);
  expect((await project(page)).shots[0].actors[0].name).toBe('拖动时改名');
  await dragStart(page);
  await page.getByRole('group', { name: '起点', exact: true }).getByLabel('X', { exact: true }).fill('700');
  await page.mouse.up();
  await expect(page.locator('footer')).toContainText('几何信息已改变');
  stored = (await project(page)).shots[0];
  expect(stored.actors[0].start).toEqual({ x: 700, y: 300 });
});

test('WASD schedules work only while held and stops when the window loses focus', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame;
    (window as any).__toolFrames = 0;
    window.requestAnimationFrame = function(callback) {
      if (new Error().stack?.includes('/src/CanvasTools.tsx')) (window as any).__toolFrames++;
      return request.call(window, callback);
    };
  });
  await ready(page); await page.getByRole('button', { name: '♙ 主角（占位贴图）', exact: true }).click();
  const count = () => page.evaluate(() => (window as any).__toolFrames as number);
  const idle = await count(); await page.waitForTimeout(150); expect(await count()).toBe(idle);
  await page.keyboard.down('d'); await expect.poll(count).toBeGreaterThan(idle + 2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const stopped = await count(); await page.waitForTimeout(150); expect(await count()).toBe(stopped);
  await page.keyboard.up('d');
  expect((await project(page)).shots[0].actors[0].start).toEqual({ x: 460, y: 300 });
});
