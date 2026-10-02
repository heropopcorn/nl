import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

test('phone review can inspect a grid atlas frame by frame before explicitly marking the resource', async ({ page }) => {
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const context = canvas.getContext('2d')!;
    ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].forEach((color, index) => {
      context.fillStyle = color; context.fillRect(index % 2 * 40, Math.floor(index / 2) * 20, 40, 20);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const id = 'd'.repeat(64), item = { id, name: '角色图集.png', kind: 'image', mime: 'image/png', bytes: png.length, url: `/resource-review/media/${id}.png` };
  const row = { asset_id: id, status: 'pending', note: '', revision: 0, updated_at: new Date().toISOString() };
  let writes = 0;
  await page.route('**/resource-review/manifest.json', route => route.fulfill({ json: { version: 1, enabled: true, namespace: 'nl-test', generatedAt: new Date().toISOString(), items: [item] } }));
  await page.route('**/resource-review/media/*', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/resource-review*', async route => {
    if (route.request().method() === 'POST') {
      writes++;
      const input = route.request().postDataJSON(); expect(input.revision).toBe(row.revision);
      Object.assign(row, { status: input.status, note: input.note, revision: row.revision + 1 });
      return route.fulfill({ json: { namespace: 'nl-test', row } });
    }
    return route.fulfill({ json: { namespace: 'nl-test', rows: [row], next: null } });
  });
  await page.goto('/'); await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('button', { name: '菜单 ☰', exact: true }).click();
  await page.getByRole('button', { name: '资源确认', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '资源确认', exact: true });
  await dialog.getByRole('button', { name: '查看 角色图集.png', exact: true }).click();
  await expect(dialog.getByRole('img', { name: '资源大图 角色图集.png', exact: true })).toBeVisible();
  await dialog.getByLabel('按序列帧查看', { exact: true }).check();
  await dialog.getByLabel('图集列数', { exact: true }).fill('2');
  await dialog.getByLabel('图集行数', { exact: true }).fill('2');
  await dialog.getByLabel('预览 FPS', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: '设置完成，返回帧预览', exact: true }).click();
  const preview = dialog.getByRole('img', { name: '序列帧预览 角色图集.png', exact: true });
  await expect(preview).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '下一帧', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('phone-atlas-controls.png') });
  const color = () => preview.evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data]);
  await expect(preview).toHaveAttribute('data-frame', '1');
  await expect.poll(color).toEqual([255, 0, 0, 255]);
  await dialog.getByRole('button', { name: '下一帧', exact: true }).click();
  await expect.poll(color).toEqual([0, 255, 0, 255]);
  await page.clock.install();
  await dialog.getByRole('button', { name: '播放序列帧', exact: true }).click();
  await page.clock.fastForward(500);
  await expect(preview).toHaveAttribute('data-frame', '3');
  await dialog.getByRole('button', { name: '暂停序列帧', exact: true }).click();
  await page.clock.fastForward(1500);
  await expect(preview).toHaveAttribute('data-frame', '3');
  await expect.poll(color).toEqual([0, 0, 255, 255]);
  await dialog.getByLabel('有效帧数', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: '上一帧', exact: true }).click();
  await expect(preview).toHaveAttribute('data-frame', '3');
  await dialog.getByLabel('选择预览帧', { exact: true }).fill('2');
  await expect.poll(color).toEqual([0, 255, 0, 255]);
  await dialog.getByLabel('图集行数', { exact: true }).fill('3');
  await expect(dialog.getByRole('alert')).toContainText('无法按当前行列等分');
  await expect(dialog.getByRole('button', { name: '播放序列帧', exact: true })).toBeDisabled();
  await dialog.getByLabel('图集行数', { exact: true }).fill('2');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(writes).toBe(0);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await dialog.getByLabel('确认备注', { exact: true }).fill('逐帧检查完成，动作可用');
  await dialog.getByRole('button', { name: '标记可用', exact: true }).click();
  await expect(dialog.getByLabel('资源确认状态')).toContainText('已保存到云端');
  expect(writes).toBe(1); expect(row.status).toBe('usable');
  await page.screenshot({ path: test.info().outputPath('phone-atlas-review.png') });
});
