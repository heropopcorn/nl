import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('wind is deterministic when seeking and matches exported frames', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await page.getByLabel('时间轴', { exact: true }).fill('45');
  const canvas = page.getByLabel('影棚预览');
  const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const dry = await pixels();
  await page.getByLabel('启用风', { exact: true }).check();
  const windy = await pixels();
  expect(windy).not.toBe(dry);
  await page.getByLabel('时间轴', { exact: true }).fill('46');
  expect(await pixels()).not.toBe(windy);
  await page.getByLabel('时间轴', { exact: true }).fill('45');
  expect(await pixels()).toBe(windy);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '输出从当前帧起 1 秒序列' }).click();
  const files = unzipSync(await readFile((await (await download).path())!));
  expect(Buffer.from(files['frame-000045.png']).toString('base64')).toBe(windy.split(',')[1]);
  await canvas.screenshot({ path: 'test-results/wind-fixed-curve.png' });
  await page.getByLabel('全局风向').selectOption('up');
  expect(await pixels()).not.toBe(windy);
  await page.getByLabel('启用风', { exact: true }).uncheck();
  expect(await pixels()).toBe(dry);
});
