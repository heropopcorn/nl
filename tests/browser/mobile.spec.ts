import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { sample } from '../../packages/core';
// @ts-expect-error Shared server module is plain JavaScript.
import { createAuth } from '../../video_game/server/auth.mjs';

test.use({ hasTouch: true });
const nav = (page: Page) => page.getByRole('navigation', { name: '工作区切换' });
async function pane(page: Page, name: string) { await nav(page).getByRole('button', { name, exact: true }).click(); }
async function start(page: Page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
}
async function fits(page: Page, element?: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  if (element) {
    await expect(element).toBeInViewport();
    const box = (await element.boundingBox())!, viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(await element.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  }
}
async function menu(page: Page) { await page.getByRole('button', { name: '菜单 ☰', exact: true }).click(); }
async function logical(page: Page, x: number, y: number) {
  const box = (await page.getByLabel('影棚预览').boundingBox())!, scale = Math.min(box.width / 1280, box.height / 720);
  return { x: box.x + (box.width - 1280 * scale) / 2 + (100 + x * 720 / 1024) * scale, y: box.y + (box.height - 720 * scale) / 2 + (720 - y * 720 / 1024) * scale };
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!));

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 932, height: 430 }]) {
  test(`every workspace fits ${size.width}x${size.height} and resizes without losing edits`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await start(page, size.width, size.height);
    await expect(nav(page)).toBeVisible();
    await fits(page, page.locator('main'));
    await page.screenshot({ path: test.info().outputPath('canvas.png') });
    await pane(page, '元素'); await fits(page, page.locator('.left'));
    await page.getByRole('button', { name: /主角（占位贴图）/ }).click();
    await expect(nav(page).getByRole('button', { name: '画布', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await pane(page, '属性'); await fits(page, page.locator('.right'));
    await page.getByLabel('元素名称', { exact: true }).fill('手机端角色');
    await page.getByLabel('时段', { exact: true }).selectOption('night');
    await page.getByLabel('月光强度').fill('0.5');
    await pane(page, '资源'); await fits(page, page.locator('.left'));
    await page.getByLabel('搜索资源').fill('学校');
    await expect(page.locator('.asset img')).toHaveCount(1);
    await expect(page.locator('.asset img')).toHaveJSProperty('naturalWidth', 1536);
    await page.screenshot({ path: test.info().outputPath('resources.png') });
    await pane(page, '场景'); await fits(page, page.locator('.scene-browser'));
    await page.locator('.tracks').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '03 五行 · 相生' })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(nav(page)).toBeHidden();
    await expect(page.getByRole('button', { name: '资源确认', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeInViewport();
    await expect(page.getByRole('link', { name: '退出', exact: true })).toBeInViewport();
    await expect(page.getByLabel('元素名称', { exact: true })).toHaveValue('手机端角色');
    await expect(page.getByLabel('搜索资源')).toHaveValue('学校');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.left')).toBeVisible();
    await expect(page.locator('.right')).toBeVisible();
    if (size.width === 390) await page.screenshot({ path: test.info().outputPath('desktop.png') });
    await page.setViewportSize(size);
    await pane(page, '场景');
    await page.getByRole('button', { name: '03 五行 · 相生' }).click();
    await pane(page, '属性');
    await expect(page.getByLabel('动效标题')).toBeVisible();
    expect((await stored(page)).shots[0].actors[0].name).toBe('手机端角色');
    expect(errors).toEqual([]);
  });
}

test('resource preview, upload and sprite workflow are usable on a narrow phone', async ({ page }) => {
  test.setTimeout(60000);
  await start(page, 360, 740);
  await pane(page, '资源');
  await page.getByRole('button', { name: '更多资源…', exact: true }).click();
  const resources = page.getByRole('dialog', { name: '更多资源', exact: true });
  await fits(page, resources);
  await resources.getByLabel('搜索资源').fill('村庄学校');
  await resources.getByRole('button', { name: '村庄学校', exact: true }).click();
  await expect(resources.getByRole('img', { name: '村庄学校', exact: true })).toBeInViewport();
  await expect(resources.getByRole('button', { name: '应用到场景', exact: true })).toBeInViewport();
  page.on('dialog', d => d.accept());
  await resources.getByRole('button', { name: '应用到场景', exact: true }).click();
  expect((await stored(page)).shots[0].background).toBe('village_school');
  await page.setViewportSize({ width: 844, height: 390 });
  await fits(page, resources);
  await page.screenshot({ path: test.info().outputPath('resource-preview-landscape.png') });
  await resources.getByLabel('关闭资源浏览器').click();
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: '自定义资源', exact: true }).click();
  await page.getByLabel('搜索资源').fill('');
  await page.getByLabel('新分类名称').fill('手机制作');
  await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByLabel('上传自定义资源').setInputFiles('video_game/art/generated/player_placeholder.png');
  await expect(page.locator('.resource-items .asset')).toHaveCount(1);
  await page.getByRole('button', { name: '制作序列帧', exact: true }).click();
  const sprite = page.getByRole('dialog', { name: '序列帧制作', exact: true });
  await fits(page, sprite);
  const file = test.info().outputPath('phone.webm');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=4:duration=1', '-c:v', 'libvpx', file]);
  await sprite.getByLabel('上传视频').setInputFiles(file);
  await sprite.getByLabel('抽帧 FPS', { exact: true }).fill('4');
  await sprite.getByRole('button', { name: '开始抽帧', exact: true }).click();
  await expect(sprite.locator('.sprite-frames article')).toHaveCount(4);
  await sprite.getByRole('button', { name: '预览 / 帧排序', exact: true }).click();
  await fits(page, sprite.locator('.sprite-workspace'));
  await sprite.locator('.sprite-frames article').nth(1).getByRole('button', { name: '前移', exact: true }).click();
  await expect(sprite.locator('.sprite-frames article').first()).toContainText('0.25s');
  await page.screenshot({ path: test.info().outputPath('sprite-frames.png') });
  await sprite.getByRole('button', { name: '制作 / 保存', exact: true }).click();
  await sprite.getByRole('button', { name: '合成序列帧', exact: true }).click();
  await expect(sprite.getByRole('button', { name: '保存到自定义分类', exact: true })).toBeEnabled();
  await sprite.getByRole('button', { name: '保存到自定义分类', exact: true }).click();
  await expect(sprite.getByLabel('序列帧状态')).toContainText('已保存到自定义分类');
  await sprite.getByLabel('关闭资源浏览器').click();
  await expect(page.getByRole('button', { name: 'phone', exact: true })).toBeVisible();
});

test('touch lasso survives pinch and pane changes; cancelled touch edits are not saved', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Multi-touch injection uses the Chromium DevTools protocol.');
  await start(page);
  await pane(page, '元素'); await page.getByLabel('添加环境元素').selectOption('fog');
  await pane(page, '属性');
  await page.getByRole('button', { name: '套索添加区域', exact: true }).click();
  await expect(page.getByLabel('影棚预览')).toBeVisible();
  const a = await logical(page, 200, 800);
  await page.touchscreen.tap(a.x, a.y);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(1);
  const cdp = await page.context().newCDPSession(page), box = (await page.locator('.viewport').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 45, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 45, y: cy, id: 1 }, { x: cx + 45, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 70, y: cy + 10, id: 1 }, { x: cx + 70, y: cy + 10, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(Number(await page.getByLabel('视图', { exact: true }).inputValue())).toBeGreaterThan(1);
  await expect(page.getByLabel('多边形草稿').locator('circle')).toHaveCount(1);
  expect((await stored(page)).shots[0].effects[0].regions).toHaveLength(1);
  await page.getByRole('button', { name: '适应画布', exact: true }).click();
  await pane(page, '属性'); await pane(page, '画布');
  for (const [x, y] of [[1000, 800], [1000, 200], [200, 200]]) { const p = await logical(page, x, y); await page.touchscreen.tap(p.x, p.y); }
  await page.getByRole('button', { name: '闭合范围', exact: true }).click();
  expect((await stored(page)).shots[0].effects[0].regions).toHaveLength(2);
  await expect(page.getByRole('button', { name: '多边形套索', exact: true })).toHaveClass('active');
  await page.getByRole('button', { name: '矩形区域', exact: true }).click();
  const p = await logical(page, 250, 750), q = await logical(page, 800, 400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...q, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect((await stored(page)).shots[0].effects[0].regions).toHaveLength(2);
  await page.getByRole('button', { name: '平移画布', exact: true }).click();
  const transform = await page.locator('.canvas-stack').getAttribute('style');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 30, y: cy + 20, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.locator('.canvas-stack').getAttribute('style')).not.toBe(transform);
  expect((await stored(page)).shots[0].effects[0].regions).toHaveLength(2);
});

test('phone menus expose backups, project import/export, legacy import and 3D inspector', async ({ page }) => {
  await start(page, 320, 568); await menu(page);
  await expect(page.getByLabel('文件菜单')).toBeInViewport();
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  const backup = page.getByRole('dialog', { name: '本机备份管理', exact: true });
  await fits(page, backup);
  await backup.getByRole('button', { name: '创建备份', exact: true }).click();
  await expect(backup.getByRole('button', { name: /^恢复备份 / }).first()).toBeVisible();
  await backup.getByRole('button', { name: '关闭备份', exact: true }).click();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出项目', exact: true }).click();
  expect((await exported).suggestedFilename()).toBe('director-project.json');
  const project = structuredClone(sample); project.shots[0].name = '手机导入';
  page.once('dialog', d => d.accept());
  await page.getByText('打开项目', { exact: true }).locator('input').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('footer')).toContainText('项目已打开');
  await page.getByLabel('导入旧场景', { exact: true }).setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema_version: 2, scene_id: 'phone-legacy', name: '手机旧场景', background: { source: 'blank', pixel_size: [768, 512], fill_color: [0.2, 0.4, 0.6, 1] } })) });
  const legacy = page.getByRole('dialog', { name: '旧场景导入确认', exact: true });
  await fits(page, legacy);
  await legacy.getByRole('button', { name: '确认导入旧场景', exact: true }).click();
  await expect(legacy).toHaveCount(0);
  page.on('dialog', d => d.accept('手机 3D'));
  await page.getByLabel('文件菜单').selectOption('three');
  await page.getByRole('button', { name: '收起菜单', exact: true }).click();
  await pane(page, '属性');
  await page.getByLabel('相机 fov').fill('50');
  await fits(page, page.locator('.right'));
  expect((await stored(page)).shots.at(-1).camera3d.fov).toBe(50);
});

test('mobile review list, media preview and confirmation remain accessible', async ({ page }) => {
  const image = readFileSync('video_game/art/generated/player_placeholder.png');
  const item = { id: 'a'.repeat(64), name: '手机确认.png', kind: 'image', mime: 'image/png', bytes: image.length, url: '/resource-review/media/' + 'a'.repeat(64) + '.png' };
  const row = { asset_id: item.id, status: 'pending', note: '', revision: 0, updated_at: new Date().toISOString() };
  await page.route('**/resource-review/manifest.json', r => r.fulfill({ json: { version: 1, enabled: true, namespace: 'mobile-test', generatedAt: new Date().toISOString(), items: [item] } }));
  await page.route('**/resource-review/media/*', r => r.fulfill({ contentType: 'image/png', body: image }));
  await page.route('**/api/resource-review*', r => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { namespace: 'mobile-test', rows: [row], next: null } });
    Object.assign(row, { status: r.request().postDataJSON().status, note: r.request().postDataJSON().note, revision: 1 });
    return r.fulfill({ json: { namespace: 'mobile-test', row } });
  });
  await start(page, 360, 740); await menu(page);
  await page.getByRole('button', { name: '资源确认', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '资源确认', exact: true });
  await fits(page, dialog);
  await dialog.getByRole('button', { name: '查看 手机确认.png', exact: true }).click();
  await expect(dialog.getByRole('img', { name: '资源大图 手机确认.png' })).toBeInViewport();
  await dialog.getByLabel('确认备注').fill('手机预览正常');
  await dialog.getByRole('button', { name: '标记可用', exact: true }).click();
  await expect(dialog.getByLabel('资源确认状态')).toContainText('已保存到云端');
  expect(row.note).toBe('手机预览正常');
  await page.screenshot({ path: test.info().outputPath('review.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await fits(page, dialog);
  await dialog.getByLabel('关闭资源浏览器').click();
});

test('local disk management and startup failure have phone layouts', async ({ page }) => {
  let failSave = false;
  await page.route('**/runtime.json', async r => { const response = await r.fetch(); await r.fulfill({ json: { ...await response.json(), mode: 'local' } }); });
  await page.route(/\/api\/workspace(?:\/|$)/, r => {
    const path = new URL(r.request().url()).pathname;
    if (failSave && r.request().method() === 'PUT') return r.fulfill({ status: 503, json: { error: '磁盘暂时不可用' } });
    if (path === '/api/workspace') return r.fulfill({ json: { token: 'test', directory: 'mobile-test' } });
    if (path.endsWith('/project')) return r.fulfill({ json: { project: sample, revision: 'mobile-revision' } });
    if (path.endsWith('/maintenance/plan')) return r.fulfill({ json: { keep: 50, mediaBytes: 0, backupBytes: 0, backupCount: 0, candidates: [], reclaimable: 0, signature: 'test', trash: [] } });
    return r.fulfill({ json: [] });
  });
  await start(page, 360, 740); await menu(page);
  await page.getByRole('button', { name: /本地文件 · 已保存/ }).click();
  const disk = page.getByRole('dialog', { name: '本地文件与磁盘管理', exact: true });
  await fits(page, disk);
  await disk.getByRole('button', { name: '检查磁盘占用', exact: true }).click();
  await expect(disk).toContainText('尚未移动或删除任何文件');
  await disk.getByLabel('关闭磁盘管理').click();
  await page.getByRole('button', { name: '收起菜单', exact: true }).click();
  failSave = true;
  await pane(page, '属性');
  await page.getByLabel('布景名称', { exact: true }).fill('保存失败仍可恢复');
  await expect(page.locator('.workspace-warning')).toContainText('磁盘暂时不可用');
  await expect(page.locator('.workspace-warning')).toBeInViewport();
  await page.route('**/runtime.json', r => r.fulfill({ status: 503, body: 'unavailable' }));
  page.once('dialog', d => d.accept());
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('启动失败');
  await fits(page, page.getByRole('alert'));
});

test('layout breakpoint uses viewport width, including desktop user agents and live dialogs', async ({ page }) => {
  await start(page, 1023, 768);
  await expect(nav(page)).toBeVisible();
  await pane(page, '资源');
  await page.getByRole('button', { name: '更多资源…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '更多资源', exact: true });
  await dialog.getByLabel('搜索资源').fill('学校');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(nav(page)).toBeHidden();
  await expect(dialog.getByLabel('搜索资源')).toHaveValue('学校');
  await fits(page, dialog);
  await dialog.getByLabel('关闭资源浏览器').click();
  await fits(page, page.locator('.app'));
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.right')).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 768 });
  await expect(nav(page)).toBeVisible();
  await expect(page.getByLabel('搜索资源')).toHaveValue('学校');
});

test('login, invalid credentials and logged-in landing fit portrait and landscape', async ({ page }) => {
  const auth = createAuth({ secret: 'responsive-auth-test-secret-32-characters' });
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.route('**/login', async r => {
      const res = await auth(new Request(r.request().url()));
      await r.fulfill({ status: res.status, contentType: 'text/html', body: await res.text() });
    });
    await page.goto('/login');
    await expect(page.getByLabel('账号')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`login-${size.width}.png`) });
    const bad = await auth(new Request('http://localhost/login', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=wrong&password=wrong' }));
    await page.setContent(await bad.text());
    await expect(page.getByRole('alert')).toContainText('账号或密码错误');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const expires = String(Date.now() + 60_000), signature = createHmac('sha256', 'responsive-auth-test-secret-32-characters').update(expires).digest('base64url');
    const loggedIn = await auth(new Request('http://localhost/logout', { headers: { cookie: `director_session=${expires}.${signature}` } }));
    await page.setContent(await loggedIn.text());
    await expect(page.getByRole('link', { name: '进入编辑器' })).toBeInViewport();
    await expect(page.getByRole('button', { name: '退出登录' })).toBeInViewport();
    await page.unroute('**/login');
  }
});
