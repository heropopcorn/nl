import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const json = (name: string, data: unknown) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
const scene = (id: string, name: string) => ({ schema_version: 2, scene_id: id, name, background: { source: 'blank', pixel_size: [768, 512], fill_color: [0.2, 0.4, 0.6, 1] } });
async function start(page: Page) { await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪'); await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false'); }
async function stored(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!)); }
async function png(page: Page) { const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 120; const g = c.getContext('2d')!; g.fillStyle = '#ff0000'; g.fillRect(0, 0, 300, 120); return c.toDataURL().split(',')[1]; }); return Buffer.from(data, 'base64'); }

test('mixed legacy import preserves dimensions, chapter order, blank color and collision', async ({ page }) => {
  await start(page); page.on('dialog', d => d.accept());
  const a = { ...scene('a', '空白旧场景'), actors: [{ id: 'blue', character_id: 'farmer_blue_placeholder', start_uv: [0.5, 0.25], route: { points_uv: [[0.5, 0.25], [0.6, 0.3]], collision_mode: 'world' } }] };
  const b = { ...scene('b', '道具旧场景'), elements: [{ id: 'e', asset_id: 'custom', position_uv: [0.5, 0.5] }], water_regions: [{ id: 'w', shape: 'rect', rect_uv: [0.1, 0.1, 0.2, 0.2], flow_dir: [0, 1] }] };
  const index = { chapters: [{ id: 'c2', name: '后章', order: 2 }, { id: 'c1', name: '前章', order: 1 }], scenes: [{ id: 'a', chapter_id: 'c2', order: 0 }, { id: 'b', chapter_id: 'c1', order: 1 }] };
  await page.getByLabel('导入旧场景', { exact: true }).setInputFiles([json('a.json', a), json('b.json', b), json('index.json', index), json('assets.json', { assets: [{ id: 'custom', file: 'sign.png', category: 'houses' }] }), { name: 'sign.png', mimeType: 'image/png', buffer: await png(page) }]);
  await expect(page.getByRole('dialog', { name: '旧场景导入确认' })).toBeVisible();
  await page.getByRole('button', { name: '确认导入旧场景', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导入 2');
  await expect.poll(async () => (await stored(page)).shots.length).toBe(5);
  const p = await stored(page), [prop, blank] = p.shots.slice(-2);
  expect(p.chapters.slice(-2).map((c: any) => c.name)).toEqual(['前章', '后章']);
  expect(prop.actors[0]).toMatchObject({ width: 600, height: 240 });
  expect(prop.effects[0].flowVector).toEqual({ x: 0, y: -2 });
  expect(blank).toMatchObject({ blank: true, blankColor: '#336699' });
  expect(blank.actors[0]).toMatchObject({ assetId: 'farmer_blue', collision: 'stop' });
  await page.locator('.scene-cards').getByRole('button', { name: /空白旧场景/ }).click();
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('画布底色')).toHaveValue('#336699');
  await page.screenshot({ path: 'test-results/legacy-blank-import.png', fullPage: true });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect.poll(async () => (await stored(page)).shots.length).toBe(3);
});

test('unknown preset with same-name images requires explicit background binding', async ({ page }) => {
  await start(page);
  const source = { ...scene('unknown', '未知预设'), background: { source: 'preset', preset_id: 'unrecognized', file: 'background.png', pixel_size: [300, 120] } };
  const data = await png(page);
  await page.getByLabel('导入旧场景', { exact: true }).setInputFiles([json('scene.json', source), { name: 'background.png', mimeType: 'image/png', buffer: data }, { name: 'background.png', mimeType: 'image/png', buffer: data }]);
  await expect(page.getByRole('button', { name: '确认导入旧场景', exact: true })).toBeDisabled();
  await page.getByLabel('未知预设 · 背景', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '确认导入旧场景', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导入 1');
  await expect.poll(async () => (await stored(page)).shots.length).toBe(4);
  const p = await stored(page);
  expect(p.shots.at(-1).backgroundAssetId).toBe(p.assets.at(-1).id);
});

test('backup restore and corrupt-current recovery; F3 stays out of PNG output', async ({ page }) => {
  await start(page); page.on('dialog', d => d.accept());
  const original = (await stored(page)).shots[0].name;
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  await page.getByRole('button', { name: '创建备份', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已创建本机备份');
  await page.getByRole('button', { name: '关闭备份', exact: true }).click();
  await page.getByLabel('布景名称', { exact: true }).fill('备份后修改');
  await expect.poll(async () => (await stored(page)).shots[0].name).toBe('备份后修改');
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  await page.getByRole('button', { name: /^恢复备份 / }).first().click();
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue(original);
  await page.getByLabel('添加环境元素').selectOption('water');
  await page.getByLabel('区域启用碰撞', { exact: true }).check();
  // Compare export pixels at a frozen surface, not two different live instants.
  await page.getByLabel('speed', { exact: true }).fill('0');
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  const canvas = page.getByLabel('影棚预览');
  const pixels = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().split(',')[1]);
  await page.keyboard.press('F3'); await expect(page.getByLabel('碰撞调试叠层')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '保存当前帧 PNG', exact: true }).click();
  expect((await readFile((await (await download).path())!)).toString('base64')).toBe(pixels);
  await page.keyboard.press('F3'); await expect(page.getByLabel('碰撞调试叠层')).toHaveCount(0);
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  await page.getByRole('button', { name: '创建备份', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已创建本机备份');
  await page.getByRole('button', { name: '关闭备份', exact: true }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => { const open = indexedDB.open('yuanli-director', 1); open.onsuccess = () => { const db = open.result, tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').put({ corrupt: true }, 'yuanli.web-director.v1'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
    localStorage.removeItem('yuanli.web-director.v1');
  });
  await page.reload();
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue(original);
  await expect(page.getByRole('button', { name: '◉ 水流 1', exact: true })).toBeVisible();
});
