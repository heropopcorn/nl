import { expect, test, type Locator, type Page } from '@playwright/test';
import { effectSchema, sample, type Project } from '../../packages/core';
import { clientToLogical } from '../../packages/core/geometry';

test.use({ hasTouch: true });

const storageKey = 'yuanli.web-director.v1';
const contextMenu = (page: Page) => page.getByRole('dialog', { name: '画布快捷菜单', exact: true });
const stored = (page: Page): Promise<Project> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
const createButtons = ['新建水流区域', '新建雾气区域', '新建降雨区域', '新建降雪区域', '新建背景遮挡块'];

function fixture(overlap = false) {
  const project = structuredClone(sample);
  project.shots[0].actors = [];
  project.shots[0].effects = [effectSchema.parse({
    id: 'context-fog', name: '双范围雾气', type: 'fog', regions: overlap
      ? [{ x: 200, y: 300, width: 500, height: 400 }, { x: 350, y: 350, width: 300, height: 300 }]
      : [{ x: 200, y: 300, width: 300, height: 300 }, { x: 1000, y: 300, width: 300, height: 300 }],
  })];
  return project;
}

async function start(page: Page, project = structuredClone(sample), width = 1440, height = 960) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ key, project }) => localStorage.setItem(key, JSON.stringify(project)), { key: storageKey, project });
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
}

async function logical(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('影棚预览').boundingBox())!;
  const scale = Math.min(box.width / 1280, box.height / 720);
  return {
    x: box.x + (box.width - 1280 * scale) / 2 + (100 + x * 720 / 1024) * scale,
    y: box.y + (box.height - 720 * scale) / 2 + (720 - y * 720 / 1024) * scale,
  };
}

async function rightClick(page: Page, x: number, y: number) {
  const p = await logical(page, x, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(contextMenu(page)).toBeVisible();
}

async function draw(page: Page, points: number[][], touch = false) {
  for (const [x, y] of points) {
    const p = await logical(page, x, y);
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  }
}

type PointerSample = {
  type: string; buttons: number; client: { x: number; y: number };
  rect: { left: number; top: number; width: number; height: number };
};

async function measuredDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, label: string) {
  const requestedStart = await logical(page, from.x, from.y), requestedEnd = await logical(page, to.x, to.y);
  await page.evaluate(() => {
    const viewport = document.querySelector('.viewport')!, canvas = document.querySelector<HTMLCanvasElement>('[aria-label="影棚预览"]')!;
    const samples: PointerSample[] = [];
    const record = (event: Event) => {
      const pointer = event as PointerEvent, rect = canvas.getBoundingClientRect();
      samples.push({ type: pointer.type, buttons: pointer.buttons, client: { x: pointer.clientX, y: pointer.clientY }, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) viewport.addEventListener(type, record, true);
    (window as typeof window & { regionPointerTrace?: { samples: PointerSample[]; stop: () => void } }).regionPointerTrace = {
      samples, stop: () => { for (const type of ['pointerdown', 'pointermove', 'pointerup']) viewport.removeEventListener(type, record, true); },
    };
  });
  await page.mouse.move(requestedStart.x, requestedStart.y); await page.mouse.down();
  await page.mouse.move(requestedEnd.x, requestedEnd.y, { steps: 4 }); await page.mouse.up();
  const samples = await page.evaluate(() => {
    const owner = window as typeof window & { regionPointerTrace?: { samples: PointerSample[]; stop: () => void } };
    const trace = owner.regionPointerTrace!; trace.stop(); delete owner.regionPointerTrace; return trace.samples;
  });
  const down = samples.find(sample => sample.type === 'pointerdown')!;
  const move = samples.filter(sample => sample.type === 'pointermove' && (sample.buttons & 1)).at(-1)!;
  expect(down).toBeTruthy(); expect(move).toBeTruthy();
  // WebKit quantizes automated mouse events to CSS pixels. Assert that injection
  // stays within one CSS pixel, then validate editing against the actual events
  // received by the app, rather than loosening scene-coordinate expectations.
  for (const [actual, requested] of [[down.client, requestedStart], [move.client, requestedEnd]]) {
    expect(Math.abs(actual.x - requested.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - requested.y)).toBeLessThanOrEqual(1);
  }
  const start = clientToLogical(down.client, down.rect)!, end = clientToLogical(move.client, move.rect)!;
  expect(start).not.toBeNull(); expect(end).not.toBeNull();
  await test.info().attach(`${label}-pointer-coordinates`, { contentType: 'application/json', body: Buffer.from(JSON.stringify({ requestedStart, requestedEnd, start, end, samples }, null, 2)) });
  return { start, end };
}

async function fits(page: Page, menu: Locator) {
  await expect(menu).toBeVisible();
  // setViewportSize resolves before resize/ResizeObserver placement necessarily
  // commits. Re-read both bounds and the actual browser viewport on every retry.
  await expect(async () => {
    const bounds = await menu.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.y).toBeGreaterThanOrEqual(-1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  }).toPass({ timeout: 5000, intervals: [50, 100, 250] });
}

test('desktop right click creates a water polygon only after drawing, never a default rectangle', async ({ page }) => {
  await start(page);
  const before = await stored(page);
  await rightClick(page, 200, 850);
  for (const name of createButtons) await expect(contextMenu(page).getByRole('button', { name, exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await contextMenu(page).getByRole('button', { name: '新建水流区域', exact: true }).click();
  await expect(contextMenu(page)).toBeHidden();
  expect(await stored(page)).toEqual(before);
  await draw(page, [[200, 700], [500, 700], [500, 400], [200, 400]]);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(4);
  expect(await stored(page)).toEqual(before);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects.find(effect => effect.type === 'water')?.regions.length).toBe(1);
  const region = (await stored(page)).shots[0].effects.find(effect => effect.type === 'water')!.regions[0];
  expect(region.points).toHaveLength(4);
  expect(region.points![0].x).toBeCloseTo(200, -1);
  expect(region.points![0].y).toBeCloseTo(700, -1);
  expect((await stored(page)).shots[0].actors).toEqual(before.shots[0].actors);
});

test('rectangle creation is transactional and cancelling a new polygon leaves no empty effect', async ({ page }) => {
  await start(page);
  const before = await stored(page);
  await page.getByRole('button', { name: '新建区域', exact: true }).click();
  await contextMenu(page).getByRole('button', { name: '新建降雨区域', exact: true }).click();
  await draw(page, [[200, 700], [500, 700]]);
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  await expect.poll(() => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
  await page.getByRole('button', { name: '新建区域', exact: true }).click();
  await contextMenu(page).getByLabel('新建区域绘制方式', { exact: true }).selectOption('rect');
  await contextMenu(page).getByRole('button', { name: '新建降雨区域', exact: true }).click();
  expect(await stored(page)).toEqual(before);
  const a = await logical(page, 200, 700), b = await logical(page, 550, 400);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  expect(await stored(page)).toEqual(before);
  await page.mouse.up();
  await expect.poll(async () => (await stored(page)).shots[0].effects.find(effect => effect.type === 'rain')?.regions.length).toBe(1);
  const region = (await stored(page)).shots[0].effects.find(effect => effect.type === 'rain')!.regions[0];
  expect(region.points).toBeUndefined();
  expect(region.x).toBeCloseTo(200, -1);
  expect(region.y).toBeCloseTo(400, -1);
  expect(region.width).toBeCloseTo(350, -1);
  expect(region.height).toBeCloseTo(300, -1);
});

test('explicit region entry works and dismissing a context menu preserves an unfinished polygon', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '新建区域', exact: true }).click();
  await contextMenu(page).getByRole('button', { name: '新建雾气区域', exact: true }).click();
  await draw(page, [[200, 700], [500, 700]]);
  const draft = page.getByLabel('多边形草稿').locator('circle');
  await expect(draft).toHaveCount(2);
  const before = await stored(page), view = await page.locator('.canvas-stack').getAttribute('style');
  await rightClick(page, 1000, 300);
  await expect(draft).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(contextMenu(page)).toBeHidden();
  await expect(draft).toHaveCount(2);
  expect(await stored(page)).toEqual(before);
  expect(await page.locator('.canvas-stack').getAttribute('style')).toBe(view);
  await draw(page, [[350, 400]]);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects.find(effect => effect.type === 'fog')?.regions[0]?.points?.length).toBe(3);
});

test('phone long press opens the menu without moving objects, adding points or mutating the project', async ({ page, browserName }) => {
  await start(page, fixture(), 390, 844);
  const point = await logical(page, 350, 450), before = await stored(page);
  const transform = await page.locator('.canvas-stack').getAttribute('style');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await expect(contextMenu(page)).toBeVisible({ timeout: 2000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    test.info().annotations.push({ type: 'coverage', description: 'WebKit long press uses synthetic pointer events; real multi-touch coverage is Chromium-only.' });
    // Untrusted PointerEvents cannot own a real pointer capture. Keep the shim
    // local to this viewport; production pointer handling remains under test.
    await page.locator('.viewport').evaluate(element => {
      const capture = element.setPointerCapture.bind(element);
      element.setPointerCapture = id => { try { capture(id); } catch { /* Synthetic pointer has no platform capture. */ } };
    });
    await page.getByLabel('影棚预览').dispatchEvent('pointerdown', { ...point, clientX: point.x, clientY: point.y, pointerId: 71, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, bubbles: true });
    await expect(contextMenu(page)).toBeVisible({ timeout: 2000 });
    await page.locator('.viewport').dispatchEvent('pointerup', { clientX: point.x, clientY: point.y, pointerId: 71, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0, bubbles: true });
  }
  await expect(contextMenu(page)).toBeVisible();
  await expect(contextMenu(page).getByRole('button', { name: '删除此区域', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(before);
  expect(await page.locator('.canvas-stack').getAttribute('style')).toBe(transform);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(contextMenu(page)).toBeHidden();
  expect(await stored(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('phone polygon creation uses touch taps and commits exactly one region only on completion', async ({ page }) => {
  await start(page, structuredClone(sample), 390, 844);
  const before = await stored(page);
  await page.getByRole('button', { name: '新建区域', exact: true }).click();
  await contextMenu(page).getByRole('button', { name: '新建雾气区域', exact: true }).click();
  await expect(contextMenu(page)).toBeHidden();
  await draw(page, [[200, 700], [600, 700], [600, 300], [200, 300]], true);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(4);
  await expect(contextMenu(page)).toBeHidden();
  expect(await stored(page)).toEqual(before);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects.length).toBe(1);
  const effect = (await stored(page)).shots[0].effects[0];
  expect(effect.type).toBe('fog');
  expect(effect.regions).toHaveLength(1);
  expect(effect.regions[0].points).toHaveLength(4);
  expect(effect.regions[0].points![0].x).toBeCloseTo(200, -1);
  expect(effect.regions[0].points![0].y).toBeCloseTo(700, -1);
  expect((await stored(page)).shots[0].actors).toEqual(before.shots[0].actors);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
  await expect(contextMenu(page)).toBeHidden();
});

test('first tap selects, repeat tap opens deletion, and undo preserves sibling geometry', async ({ page }) => {
  const project = fixture();
  await start(page, project, 390, 844);
  const point = await logical(page, 350, 450);
  await page.touchscreen.tap(point.x, point.y);
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.locator('footer')).toContainText('已选中双范围雾气的区域 1');
  expect((await stored(page)).shots[0].effects).toEqual(project.shots[0].effects);
  // This is repeat selection, not a timed double-click.
  await page.waitForTimeout(700);
  await page.touchscreen.tap(point.x, point.y);
  await expect(contextMenu(page)).toBeVisible();
  expect((await stored(page)).shots[0].effects).toEqual(project.shots[0].effects);
  await contextMenu(page).getByRole('button', { name: '删除此区域', exact: true }).click();
  await expect(contextMenu(page)).toBeHidden();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions.length).toBe(1);
  expect((await stored(page)).shots[0].effects[0].regions).toEqual([project.shots[0].effects[0].regions[1]]);
  await page.getByRole('button', { name: '菜单 ☰', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '收起菜单', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions).toEqual(project.shots[0].effects[0].regions);
  await page.touchscreen.tap(point.x, point.y);
  await expect(contextMenu(page)).toBeHidden();
  await page.touchscreen.tap(point.x, point.y);
  await contextMenu(page).getByRole('button', { name: '区域属性', exact: true }).click();
  await expect(page.locator('#pane-inspector')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#pane-inspector .active-region')).toContainText('区域 1');
});

test('deleting the last region retains its empty element and undo restores the region', async ({ page }) => {
  const project = fixture(); project.shots[0].effects[0].regions.splice(1);
  await start(page, project, 390, 844);
  const point = await logical(page, 350, 450);
  await page.touchscreen.tap(point.x, point.y);
  await expect(contextMenu(page)).toBeHidden();
  await page.touchscreen.tap(point.x, point.y);
  await contextMenu(page).getByRole('button', { name: '删除此区域', exact: true }).click();
  await expect(contextMenu(page)).toBeHidden();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0]?.regions.length).toBe(0);
  const effects = (await stored(page)).shots[0].effects;
  expect(effects).toHaveLength(1);
  expect(effects[0]).toEqual({ ...project.shots[0].effects[0], regions: [] });
  await page.getByRole('button', { name: '编辑所选属性', exact: true }).click();
  await expect(page.locator('#pane-inspector')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#pane-inspector')).toContainText('暂无区域，此元素暂不产生效果。请绘制新区域。');
  await page.getByRole('button', { name: '关闭属性', exact: true }).click();
  await page.getByRole('button', { name: '菜单 ☰', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '收起菜单', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects).toEqual(project.shots[0].effects);
});

test('changing regions or tapping blank resets repeat selection without opening a menu', async ({ page }) => {
  const project = fixture();
  await start(page, project, 390, 844);
  const a = await logical(page, 350, 450), b = await logical(page, 1150, 450), blank = await logical(page, 750, 850);
  await page.touchscreen.tap(a.x, a.y);
  await expect(contextMenu(page)).toBeHidden();
  await page.touchscreen.tap(b.x, b.y);
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.locator('footer')).toContainText('区域 2');
  await page.touchscreen.tap(blank.x, blank.y);
  await expect(contextMenu(page)).toBeHidden();
  await page.touchscreen.tap(b.x, b.y);
  await expect(contextMenu(page)).toBeHidden();
  await page.touchscreen.tap(b.x, b.y);
  await expect(contextMenu(page)).toBeVisible();
  await expect(contextMenu(page)).toContainText('双范围雾气 · 区域 2');
  expect((await stored(page)).shots[0].effects).toEqual(project.shots[0].effects);
});

test('phone repeat selection keeps an overlapping target even if ordinary pointer-down picks its sibling', async ({ page }) => {
  const project = fixture(true);
  await start(page, project, 390, 844);
  const p = await logical(page, 450, 450);
  await page.touchscreen.tap(p.x, p.y);
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.locator('footer')).toContainText('区域 2');
  await page.touchscreen.tap(p.x, p.y);
  await expect(contextMenu(page)).toBeVisible();
  await expect(contextMenu(page).getByLabel('选择命中的区域', { exact: true })).toHaveValue('context-fog:1');
  expect((await stored(page)).shots[0].effects).toEqual(project.shots[0].effects);
});

test('overlapping hits can be selected explicitly before removing a single region', async ({ page }) => {
  const project = fixture(true);
  await start(page, project);
  await rightClick(page, 450, 450);
  const chooser = contextMenu(page).getByLabel('选择命中的区域', { exact: true });
  await expect(chooser.locator('option')).toHaveCount(2);
  const options = await chooser.locator('option').allTextContents();
  const second = options.find(text => /区域\s*2/.test(text));
  expect(second).toBeTruthy();
  await chooser.selectOption('context-fog:1');
  await contextMenu(page).getByRole('button', { name: '删除此区域', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions).toEqual([project.shots[0].effects[0].regions[0]]);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions).toEqual(project.shots[0].effects[0].regions);
});

test('explicit move of an overlapping region keeps the selected target and same-type add preserves siblings', async ({ page }) => {
  const project = fixture(true); project.shots[0].snap = 0;
  await start(page, project);
  await rightClick(page, 450, 450);
  await contextMenu(page).getByLabel('选择命中的区域', { exact: true }).selectOption('context-fog:1');
  await contextMenu(page).getByRole('button', { name: '移动此区域', exact: true }).click();
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.getByRole('button', { name: '移动 V', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const selection = await logical(page, 450, 450);
  await page.touchscreen.tap(selection.x, selection.y);
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.locator('footer')).toContainText('区域 2');
  // This start point belongs to both regions. The menu's explicit second-region
  // choice must win over the ordinary first-hit rule when the drag begins.
  const firstDrag = await measuredDrag(page, { x: 450, y: 450 }, { x: 520, y: 500 }, 'overlap-move-first');
  const afterFirst = { x: project.shots[0].effects[0].regions[1].x + firstDrag.end.x - firstDrag.start.x,
    y: project.shots[0].effects[0].regions[1].y + firstDrag.end.y - firstDrag.start.y };
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[1].x).toBeCloseTo(afterFirst.x, 6);
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[1].y).toBeCloseTo(afterFirst.y, 6);
  expect((await stored(page)).shots[0].effects[0].regions[0]).toEqual(project.shots[0].effects[0].regions[0]);

  const secondDrag = await measuredDrag(page, { x: 500, y: 500 }, { x: 540, y: 530 }, 'overlap-move-second');
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[1].x).toBeCloseTo(afterFirst.x + secondDrag.end.x - secondDrag.start.x, 6);
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[1].y).toBeCloseTo(afterFirst.y + secondDrag.end.y - secondDrag.start.y, 6);
  expect((await stored(page)).shots[0].effects[0].regions[0]).toEqual(project.shots[0].effects[0].regions[0]);

  const moved = (await stored(page)).shots[0].effects[0].regions;
  await rightClick(page, 500, 500);
  await contextMenu(page).getByLabel('选择命中的区域', { exact: true }).selectOption('context-fog:1');
  await contextMenu(page).getByRole('button', { name: '添加同类区域', exact: true }).click();
  await draw(page, [[850, 700], [1100, 700], [1000, 500]]);
  expect((await stored(page)).shots[0].effects[0].regions).toEqual(moved);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions.length).toBe(3);
  expect((await stored(page)).shots[0].effects).toHaveLength(1);
  expect((await stored(page)).shots[0].effects[0].regions.slice(0, 2)).toEqual(moved);
  expect((await stored(page)).shots[0].effects[0].regions[2].points).toHaveLength(3);
});

test('redraw and vertex editing target the hit region and preserve sibling geometry', async ({ page }) => {
  const project = fixture();
  await start(page, project);
  await rightClick(page, 350, 450);
  await contextMenu(page).getByRole('button', { name: '重绘此区域', exact: true }).click();
  await draw(page, [[250, 350], [450, 350], [350, 550]]);
  expect((await stored(page)).shots[0].effects[0].regions).toEqual(project.shots[0].effects[0].regions);
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[0].points?.length).toBe(3);
  expect((await stored(page)).shots[0].effects[0].regions[1]).toEqual(project.shots[0].effects[0].regions[1]);
  await page.getByRole('button', { name: '移动 V', exact: true }).click();
  await rightClick(page, 350, 430);
  await contextMenu(page).getByRole('button', { name: '编辑区域顶点', exact: true }).click();
  await expect(page.getByRole('button', { name: '顶点', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const first = (await stored(page)).shots[0].effects[0].regions[0].points![0];
  const vertexDrag = await measuredDrag(page, first, { x: first.x - 30, y: first.y + 30 }, 'region-vertex');
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[0].points![0].x).toBeCloseTo(vertexDrag.end.x, 6);
  await expect.poll(async () => (await stored(page)).shots[0].effects[0].regions[0].points![0].y).toBeCloseTo(vertexDrag.end.y, 6);
  expect((await stored(page)).shots[0].effects[0].regions[1]).toEqual(project.shots[0].effects[0].regions[1]);
  await expect(contextMenu(page)).toBeHidden();
});

test('moving, a second finger and pointer cancellation cancel pending long presses', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Real multi-touch and touchCancel injection use Chromium DevTools.');
  const project = structuredClone(sample); project.shots[0].actors = [];
  await start(page, project, 390, 844);
  const before = await stored(page), p = await logical(page, 650, 650);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 24, y: p.y, id: 1 }] });
  await page.waitForTimeout(650);
  await expect(contextMenu(page)).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(contextMenu(page)).toBeHidden();

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 2 }, { x: p.x + 50, y: p.y, id: 3 }] });
  await page.waitForTimeout(650);
  await expect(contextMenu(page)).toBeHidden();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForTimeout(650);
  await expect(contextMenu(page)).toBeHidden();
  expect(await stored(page)).toEqual(before);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(0);
  await cdp.detach();
});

test('menus opened at canvas edges remain in the viewport through phone and desktop resizing', async ({ page }) => {
  await start(page, fixture(), 320, 568);
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 960 }]) {
    await page.setViewportSize(size);
    // Closing on resize and repositioning on resize are both safe. If retained,
    // the existing menu must already fit the new viewport before opening again.
    if (await contextMenu(page).isVisible()) { await fits(page, contextMenu(page)); await page.keyboard.press('Escape'); }
    const corner = await logical(page, 1490, 70);
    const viewport = (await page.locator('.viewport').boundingBox())!;
    const x = Math.min(corner.x, viewport.x + viewport.width - 4);
    const y = Math.min(corner.y, viewport.y + viewport.height - 4);
    await page.mouse.click(x, y, { button: 'right' });
    await fits(page, contextMenu(page));
    await expect(contextMenu(page).getByRole('button', { name: '新建背景遮挡块', exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(contextMenu(page)).toBeHidden();
  await expect(page.locator('main')).not.toHaveAttribute('inert');
});
