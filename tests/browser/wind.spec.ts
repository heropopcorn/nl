import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

test('wind animates independently and disabling it restores the scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const canvas = page.getByLabel('影棚预览');
  const pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const dry = await pixels();
  await page.getByLabel('启用风', { exact: true }).check();
  const windy = await pixels();
  expect(windy).not.toBe(dry);
  await expect.poll(pixels).not.toBe(windy);
  await canvas.screenshot({ path: 'test-results/wind-fixed-curve.png' });
  await page.getByLabel('全局风向').selectOption('up');
  expect(await pixels()).not.toBe(windy);
  await page.getByLabel('启用风', { exact: true }).uncheck();
  expect(await pixels()).toBe(dry);
});
