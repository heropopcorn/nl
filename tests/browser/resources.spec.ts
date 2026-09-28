import { test, expect } from '@playwright/test';

test('compact unified resource library groups backgrounds and props', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  const library = page.locator('.resource-library');
  await expect(page.locator('.left .resources')).toHaveCount(1);
  await expect(page.getByLabel('资源分类')).toHaveValue('backgrounds');
  await expect(library.getByRole('button', { name: '村庄', exact: true })).toBeVisible();
  await expect(library.getByRole('button', { name: '村庄学校', exact: true })).toBeVisible();
  const image = library.locator('.asset img').first();
  await expect(image).toHaveCSS('width', '52px');
  await expect(image).toHaveCSS('height', '36px');
  await page.getByLabel('搜索资源').fill('学校');
  await expect(library.locator('.asset')).toHaveCount(1);
  page.on('dialog', dialog => dialog.accept());
  await library.getByRole('button', { name: '村庄学校', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('yuanli.web-director.v1')!).shots[0].background)).toBe('village_school');
  await page.getByLabel('搜索资源').fill('');
  await page.getByLabel('资源分类').selectOption('trees');
  await expect(library.getByRole('button', { name: '橡树', exact: true })).toBeVisible();
  await library.getByRole('button', { name: '橡树', exact: true }).click();
  await expect(page.getByLabel('元素名称')).toHaveValue('橡树');
  await library.getByRole('button', { name: '自定义资源', exact: true }).click();
  await expect(library.getByText('暂无匹配资源，可上传添加。')).toBeVisible();
  await expect(page.getByLabel('上传自定义资源')).toHaveCount(1);
});
