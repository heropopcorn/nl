import { test, expect, type Page } from '@playwright/test';
import { sample } from '../../packages/core';
import type { Route } from '@playwright/test';

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!));
async function start(page: Page) {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
}
test('repeated resource applications append elements without losing prior edits', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: '更多资源…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '更多资源', exact: true });
  await dialog.getByLabel('资源分类').selectOption('characters');
  await dialog.getByRole('button', { name: '农夫', exact: true }).click();
  for (const count of [2, 3, 4]) {
    await dialog.getByRole('button', { name: '应用到场景', exact: true }).click();
    await expect(dialog.locator('.resource-feedback')).toContainText('已添加元素');
    await expect.poll(async () => (await stored(page)).shots[0].actors.length).toBe(count);
  }
  await dialog.getByLabel('关闭资源浏览器').click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect((await stored(page)).shots[0].actors).toHaveLength(3);
});
test('numeric drafts and names allow replacement, group undo and reject invalid values without storing zero', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /♙ 主角/ }).click();
  const scale = page.getByRole('spinbutton', { name: '缩放比例', exact: true });
  await scale.fill('');
  await expect(scale).toHaveValue('');
  expect((await stored(page)).shots[0].actors[0].scale).toBe(1);
  await scale.fill('-3');
  await expect(scale).toHaveAttribute('aria-invalid', 'true');
  await scale.blur();
  await expect(scale).toHaveValue('1');
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  await scale.fill('2'); await scale.fill('3');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(scale).toHaveValue('1');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(scale).toHaveValue('3');
  const name = page.getByLabel('元素名称', { exact: true });
  await name.fill(''); await expect(name).toHaveValue('');
  await name.pressSequentially('新的角色');
  expect((await stored(page)).shots[0].actors[0].name).toBe('新的角色');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(name).toHaveValue('主角（占位贴图）');
});
test('opening a project confirms replacement and preserves a recoverable checkpoint', async ({ page }) => {
  await start(page);
  await page.getByLabel('布景名称', { exact: true }).fill('当前未替换内容');
  const replacement = structuredClone(sample); replacement.shots[0].name = '新导入项目';
  const file = { name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) };
  const input = page.getByText('打开项目', { exact: true }).locator('input');
  page.once('dialog', d => d.dismiss());
  await input.setInputFiles(file);
  await expect(page.locator('footer')).toContainText('已取消打开项目');
  expect((await stored(page)).shots[0].name).toBe('当前未替换内容');
  page.once('dialog', d => d.accept());
  await input.setInputFiles(file);
  await expect(page.locator('footer')).toContainText('项目已打开');
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue('新导入项目');
  const names = await page.evaluate(async url => {
    const storage = await import(url);
    return (await storage.listProjectBackups()).map((b: { project: typeof sample }) => b.project.shots[0].name);
  }, '/src/storage.ts');
  expect(names).toContain('当前未替换内容');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue('当前未替换内容');
});
test('separate slider gestures create separate undo steps even without losing focus', async ({ page }) => {
  await start(page);
  const slider = page.getByLabel('风力', { exact: true });
  for (const value of ['0.6', '0.85']) {
    await slider.dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0 });
    await slider.fill(value);
    await slider.dispatchEvent('pointerup', { pointerType: 'mouse', button: 0 });
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(slider).toHaveValue('0.6');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(slider).toHaveValue(String(sample.shots[0].wind.strength));
});
test('deleting another scene preserves the selected shot and protects the final scene', async ({ page }) => {
  const p = structuredClone(sample);
  p.scenes.push({ id: 'second', name: '第二场景', chapterId: p.chapters[0].id });
  p.shots[1].sceneId = 'second'; p.shots[2].sceneId = 'second';
  await page.addInitScript(p => localStorage.setItem('yuanli.web-director.v1', JSON.stringify(p)), p);
  await start(page);
  await page.locator('.scene-cards').getByRole('button', { name: /02 学校/ }).click();
  page.once('dialog', d => d.accept());
  await page.locator('.scene-row').filter({ has: page.getByRole('button', { name: p.scenes[0].name, exact: true }) }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue(p.shots[1].name);
  await expect(page.locator('.scene-row').getByRole('button', { name: '删除', exact: true })).toBeDisabled();
});
test('static previews stop rendering, live weather resumes and hidden mobile panes suspend it', async ({ page }) => {
  await start(page);
  const preview = page.getByLabel('影棚预览');
  const count = () => preview.getAttribute('data-render-count');
  const first = await count(); await page.waitForTimeout(200);
  expect(await count()).toBe(first);
  await page.getByLabel('启用风', { exact: true }).check();
  await expect.poll(count).not.toBe(first);
  let running = await count(); await expect.poll(count).not.toBe(running);
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole('navigation', { name: '工作区切换' });
  await nav.getByRole('button', { name: '属性', exact: true }).click();
  await page.waitForTimeout(100); const suspended = await count(); await page.waitForTimeout(200);
  expect(await count()).toBe(suspended);
  await nav.getByRole('button', { name: '画布', exact: true }).click();
  await expect.poll(count).not.toBe(suspended);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100); const hidden = await count(); await page.waitForTimeout(200);
  expect(await count()).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(count).not.toBe(hidden);
});
test('failed resource loading can retry without refreshing or losing edits', async ({ page }) => {
  let fail = true;
  await page.route('**/assets.json', route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
  await page.goto('/');
  await expect(page.getByRole('button', { name: '重试加载资源', exact: true })).toBeVisible();
  await page.getByLabel('布景名称', { exact: true }).fill('加载失败期间的编辑');
  fail = false;
  await page.getByRole('button', { name: '重试加载资源', exact: true }).click();
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue('加载失败期间的编辑');
  await expect(page.getByLabel('项目保存状态')).toContainText('已保存到浏览器');
});

async function localWorkspace(page: Page, hold: (route: Route) => boolean) {
  await page.route('**/runtime.json', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), mode: 'local' } });
  });
  await page.route(/\/api\/workspace(?:\/|$)/, route => {
    if (route.request().method() === 'PUT' && hold(route)) return;
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workspace') return route.fulfill({ json: { token: 'test', directory: 'optimization-test' } });
    if (path.endsWith('/project')) return route.fulfill({ json: { project: sample, revision: 'test-revision' } });
    return route.fulfill({ json: [] });
  });
  await start(page);
  await expect(page.getByLabel('项目保存状态')).toContainText('已保存到磁盘');
}

test('project replacement locks the other disk and backup entry points until completion', async ({ page }) => {
  let held: Route | undefined;
  await localWorkspace(page, route => {
    if (route.request().postDataJSON().checkpoint) { held = route; return true; }
    return false;
  });
  const next = structuredClone(sample); next.shots[0].name = '安全替换后的项目';
  page.once('dialog', dialog => dialog.accept());
  await page.getByText('打开项目', { exact: true }).locator('input').setInputFiles({ name: 'next.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(next)) });
  await expect.poll(() => !!held).toBe(true);
  await expect(page.getByRole('button', { name: /^本地文件 ·/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: '本机备份', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存项目', exact: true })).toBeDisabled();
  await held!.fulfill({ json: { project: sample, revision: 'checkpoint-revision' } });
  await expect(page.getByLabel('布景名称', { exact: true })).toHaveValue(next.shots[0].name);
  await expect(page.getByRole('button', { name: /^本地文件 ·/ })).toBeEnabled();
});

test('an earlier manual save cannot report all changes saved when new water overlap blocks saving', async ({ page }) => {
  let holdNext = false, held: Route | undefined;
  await localWorkspace(page, route => {
    if (holdNext) { holdNext = false; held = route; return true; }
    return false;
  });
  holdNext = true;
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await expect.poll(() => !!held).toBe(true);
  await page.getByLabel('添加环境元素').selectOption('water');
  await page.getByLabel('添加环境元素').selectOption('water');
  await expect(page.getByLabel('项目保存状态')).toContainText('水域重叠');
  await held!.fulfill({ json: { project: sample, revision: 'older-revision' } });
  await expect(page.locator('footer')).toContainText('仍有修改未保存');
  await expect(page.getByLabel('项目保存状态')).toContainText('未保存');
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
});

test('oversized upload batches are rejected before allocating base64 images', async ({ page }) => {
  await page.addInitScript(() => {
    const actualSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
    Object.defineProperty(File.prototype, 'size', { get() { return this.name.startsWith('batch-') ? 20 * 1024 * 1024 : actualSize.call(this); } });
    const read = FileReader.prototype.readAsDataURL;
    (window as any).__batchReads = 0;
    FileReader.prototype.readAsDataURL = function(blob) { (window as any).__batchReads++; return read.call(this, blob); };
  });
  await start(page);
  await page.getByRole('button', { name: '自定义资源', exact: true }).click();
  await page.getByLabel('上传自定义资源').setInputFiles(Array.from({ length: 6 }, (_, i) => ({ name: `batch-${i}.png`, mimeType: 'image/png', buffer: Buffer.from('not read') })));
  await expect(page.locator('.resource-feedback')).toContainText('100MB');
  expect(await page.evaluate(() => (window as any).__batchReads)).toBe(0);
  expect((await stored(page)).assets).toHaveLength(0);
});
