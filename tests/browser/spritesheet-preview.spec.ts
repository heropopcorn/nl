import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.use({ hasTouch: true, viewport: { width: 360, height: 740 } });

test('phone sprite inspection preserves the paused frame, supports stepping and returns to save', async ({ page }) => {
  test.setTimeout(60_000);
  const file = test.info().outputPath('inspection.webm');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=4:duration=1', '-c:v', 'libvpx', file]);
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('navigation', { name: '工作区切换' }).getByRole('button', { name: '资源', exact: true }).click();
  await page.getByRole('button', { name: '自定义资源', exact: true }).click();
  await page.getByRole('button', { name: '制作序列帧', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '序列帧制作', exact: true });
  await editor.getByLabel('上传视频').setInputFiles(file);
  await editor.getByLabel('抽帧 FPS', { exact: true }).fill('4');
  await editor.getByLabel('播放 FPS', { exact: true }).fill('2');
  await editor.getByRole('button', { name: '开始抽帧', exact: true }).click();
  await expect(editor.locator('.sprite-frames article')).toHaveCount(4);
  await editor.getByRole('button', { name: '关闭制作与保存', exact: true }).click();
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 1 / 4 帧');
  await editor.getByRole('button', { name: '下一帧', exact: true }).click();
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 2 / 4 帧');
  await expect(editor.getByLabel('预览帧位置')).toHaveValue('2');

  await page.clock.install();
  await editor.getByRole('button', { name: '播放预览', exact: true }).click();
  await page.clock.fastForward(500);
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 3 / 4 帧');
  const pausedSource = await editor.getByRole('img', { name: '当前序列帧', exact: true }).getAttribute('src');
  await editor.getByRole('button', { name: '暂停预览', exact: true }).click();
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 3 / 4 帧');
  await page.clock.fastForward(1500);
  await expect(editor.getByRole('img', { name: '当前序列帧', exact: true })).toHaveAttribute('src', pausedSource!);
  await expect(editor.getByLabel('预览帧位置')).toHaveValue('3');
  await editor.getByRole('button', { name: '上一帧', exact: true }).click();
  await expect(editor.getByLabel('预览帧位置')).toHaveValue('2');
  await editor.getByLabel('预览帧位置').fill('4');
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 4 / 4 帧');
  await editor.getByRole('button', { name: '下一帧', exact: true }).click();
  await expect(editor.getByLabel('预览帧位置')).toHaveValue('1');

  await editor.getByRole('button', { name: '帧排序', exact: true }).click();
  await editor.getByLabel('启用帧 3').uncheck();
  await editor.locator('.sprite-frames article').nth(2).getByRole('button', { name: '帧 3', exact: true }).click();
  await expect(editor.locator('#sprite-frames-drawer')).toBeHidden();
  await expect(editor.getByLabel('当前预览帧')).toContainText('第 3 / 4 帧');
  await expect(editor.getByLabel('当前预览帧')).toContainText('已禁用，不参与播放和合成');
  await editor.getByRole('button', { name: '下一帧', exact: true }).click();
  await expect(editor.getByLabel('预览帧位置')).toHaveValue('4');

  await editor.getByRole('button', { name: '检查完成，返回制作 / 保存', exact: true }).click();
  await expect(editor.locator('#sprite-settings-drawer')).toHaveAttribute('data-open', 'true');
  await expect(editor.getByRole('button', { name: '合成序列帧', exact: true })).toBeEnabled();
  await expect(editor.getByRole('button', { name: '保存到自定义分类', exact: true })).toBeDisabled();
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
