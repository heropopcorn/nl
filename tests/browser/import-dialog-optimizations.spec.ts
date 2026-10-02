import { test, expect, type Page } from '@playwright/test';
import { sample } from '../../packages/core';

const scene = (id: string) => ({ schema_version: 2, scene_id: id, name: id, background: { source: 'blank', pixel_size: [768, 512], fill_color: [0.2, 0.4, 0.6, 1] } });
const json = (name: string, value: unknown) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
async function ready(page: Page) {
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await expect(page.getByLabel('影棚预览')).toHaveAttribute('aria-busy', 'false');
}

test('backup read errors and successful checkpoints are visible inside the dialog', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const original = indexedDB.open.bind(indexedDB);
    (window as any).__restoreDatabaseOpen = () => { indexedDB.open = original; };
    indexedDB.open = () => { throw new Error('测试：存储不可用'); };
  });
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '本机备份管理', exact: true });
  await expect(dialog.getByLabel('备份操作反馈')).toContainText('备份读取失败');
  await expect(page.getByRole('status')).toHaveCount(1);
  await page.evaluate(() => (window as any).__restoreDatabaseOpen());
  await dialog.getByRole('button', { name: '创建备份', exact: true }).click();
  await expect(dialog.getByLabel('备份操作反馈')).toContainText('已创建本机备份');
  await expect(dialog.getByRole('button', { name: '创建备份', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: /^恢复备份 / }).first()).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭备份', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存项目', exact: true })).toBeEnabled();
});

test('legacy parse and validation failures stay visible with import controls available', async ({ page }) => {
  // Fill the project to its schema limit so conversion validation must reject an
  // otherwise valid extra scene, without modifying the original document.
  const project = structuredClone(sample);
  while (project.shots.length < 100) project.shots.push({ ...structuredClone(sample.shots[0]), id: `full-${project.shots.length}` });
  await page.addInitScript(p => localStorage.setItem('yuanli.web-director.v1', JSON.stringify(p)), project);
  await ready(page);
  await page.getByLabel('导入旧场景', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  const dialog = page.getByRole('dialog', { name: '旧场景导入确认', exact: true });
  await expect(dialog.getByLabel('旧场景导入反馈')).toContainText('无法读取 broken.json');
  await expect(dialog.getByRole('button', { name: '确认导入旧场景', exact: true })).toBeDisabled();
  await dialog.getByLabel('重新选择场景文件', { exact: true }).setInputFiles(json('valid.json', scene('extra')));
  await dialog.getByRole('button', { name: '确认导入旧场景', exact: true }).click();
  await expect(dialog.getByLabel('旧场景导入反馈')).toContainText('导入失败');
  await expect(dialog.getByRole('button', { name: '确认导入旧场景', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('heading', { name: '确认导入 1 个场景', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots.length)).toBe(100);
});

test('legacy inspection reads sequentially and ignores a second selection until it finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.text;
    (window as any).__jsonActive = 0; (window as any).__jsonMaxActive = 0; (window as any).__jsonReads = 0;
    File.prototype.text = async function() {
      if (!this.name.startsWith('held-')) return read.call(this);
      (window as any).__jsonReads++;
      (window as any).__jsonActive++;
      (window as any).__jsonMaxActive = Math.max((window as any).__jsonMaxActive, (window as any).__jsonActive);
      try { await new Promise<void>(resolve => { (window as any).__releaseJson = resolve; }); return await read.call(this); }
      finally { (window as any).__jsonActive--; }
    };
  });
  await ready(page);
  const input = page.getByLabel('导入旧场景', { exact: true });
  await input.setInputFiles([json('held-one.json', scene('first')), json('held-two.json', scene('second'))]);
  const dialog = page.getByRole('dialog', { name: '旧场景导入确认', exact: true });
  await expect(dialog.getByLabel('旧场景导入反馈')).toContainText('正在读取');
  await expect(input).toBeDisabled();
  await input.setInputFiles(json('racing.json', scene('unwanted')));
  await page.evaluate(() => (window as any).__releaseJson());
  await expect.poll(() => page.evaluate(() => (window as any).__jsonReads)).toBe(2);
  expect(await page.evaluate(() => (window as any).__jsonMaxActive)).toBe(1);
  await page.evaluate(() => (window as any).__releaseJson());
  await expect(dialog.getByRole('heading', { name: '确认导入 2 个场景', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认导入旧场景', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '确认导入旧场景', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导入 2 个旧场景');
  const names = await page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots.map((shot: { name: string }) => shot.name));
  expect(names).toContain('first'); expect(names).toContain('second'); expect(names).not.toContain('unwanted');
});
