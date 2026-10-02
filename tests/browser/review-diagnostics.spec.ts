import { test, expect, type Locator, type Page } from '@playwright/test';
import type { ReviewItem, ReviewManifest, ReviewRow } from '../../apps/director-web/src/resource-review-client';

const namespace = 'diagnostics-test';
const generatedAt = '2026-10-02T00:00:00.000Z';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const emptyScan = { source: 'resource-review/inbox/' as const, files: 0, uniqueAssets: 0, images: 0, animations: 0, videos: 0, pending: 0, reviewed: 0 };

function manifest(items: ReviewItem[] = [], scan?: ReviewManifest['scan']): ReviewManifest {
  return { version: 1, enabled: true, namespace, generatedAt, items, ...(scan ? { scan } : {}) };
}
function item(letter: string, name: string): ReviewItem {
  const id = letter.repeat(64);
  return { id, name, kind: 'image', mime: 'image/png', bytes: image.length, url: `/resource-review/media/${id}.png` };
}
function row(asset: ReviewItem, note = ''): ReviewRow {
  return { asset_id: asset.id, status: 'pending', note, revision: 0, updated_at: generatedAt };
}
async function openReview(page: Page) {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('影棚已就绪');
  await page.getByRole('button', { name: '资源确认', exact: true }).click();
  return page.getByRole('dialog', { name: '资源确认', exact: true });
}
async function expectUnresolved(dialog: Locator) {
  await expect(dialog.locator('.review-empty')).toHaveCount(0);
  await expect(dialog.locator('.review-toolbar small')).not.toContainText('本批次');
  await expect(dialog.getByText('资源确认尚未启用', { exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  // Every review request stays local to the test; no database or remote media.
  await page.route('**/resource-review/media/*', route => route.fulfill({ contentType: 'image/png', body: image }));
});

for (const scenario of [
  {
    name: 'empty source directory is not mistaken for an entirely reviewed repository',
    scan: emptyScan,
    message: '本次构建的待确认目录为空',
    absent: '本次扫描的资源均已有标记',
    details: '扫描 0 个文件，去重后 0 项',
  },
  {
    name: 'an entirely reviewed source batch is distinguished from an empty inbox',
    scan: { ...emptyScan, files: 5, uniqueAssets: 4, images: 2, animations: 1, videos: 1, reviewed: 4 },
    message: '本次扫描的资源均已有标记',
    absent: '本次构建的待确认目录为空',
    details: '扫描 5 个文件，去重后 4 项：图片 2 · 动图 1 · 视频 1',
  },
  {
    name: 'an old empty manifest without scan diagnostics does not invent an empty-source reason',
    scan: undefined,
    message: '此旧版清单未提供扫描统计，无法判断是目录为空还是资源已标记',
    absent: '本次构建的待确认目录为空',
    details: '只扫描 resource-review/inbox/',
  },
]) {
  test(scenario.name, async ({ page }) => {
    let apiCalls = 0;
    await page.route('**/resource-review/manifest.json', route => route.fulfill({ json: manifest([], scenario.scan) }));
    await page.route('**/api/resource-review*', route => {
      apiCalls++;
      expect(route.request().method()).toBe('GET');
      return route.fulfill({ json: { namespace, rows: [], next: null } });
    });
    const dialog = await openReview(page);
    const empty = dialog.locator('.review-empty');
    await expect(empty).toContainText(scenario.message);
    await expect(empty).toContainText('扫描来源：resource-review/inbox/');
    await expect(empty).not.toContainText(scenario.absent);
    if (!scenario.scan) await expect(empty).not.toContainText('本次扫描的资源均已有标记');
    await expect(dialog.locator('.review-toolbar small')).toContainText('本批次 0 项 · 未标记 0');
    await dialog.getByText('发布范围与扫描信息', { exact: true }).click();
    await expect(dialog.locator('.review-batch-info')).toContainText(scenario.details);
    expect(apiCalls).toBe(1);
  });
}

test('delayed or failed status requests cannot appear as a valid empty batch, and retry rechecks the manifest', async ({ page }) => {
  let manifestCalls = 0, apiCalls = 0, fail = true;
  let release!: () => void;
  const heldResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/resource-review/manifest.json', route => {
    manifestCalls++;
    return route.fulfill({ json: manifest([], emptyScan) });
  });
  await page.route('**/api/resource-review*', async route => {
    apiCalls++;
    if (apiCalls === 1) await heldResponse;
    return fail
      ? route.fulfill({ status: 503, json: { error: '诊断测试：云端暂时不可用' } })
      : route.fulfill({ json: { namespace, rows: [], next: null } });
  });
  try {
    const dialog = await openReview(page);
    const refresh = dialog.getByRole('button', { name: '刷新云端状态', exact: true });
    await expect.poll(() => apiCalls).toBe(1);
    await expect(dialog.locator('.review-toolbar small')).toHaveText('正在读取批次与状态…');
    await expect(refresh).toBeDisabled();
    await expectUnresolved(dialog);
    release();
    await expect(dialog.getByRole('alert')).toContainText('诊断测试：云端暂时不可用');
    await expect(dialog.locator('.review-toolbar small')).toContainText('不能据此判断是否还有未标记资源');
    await expectUnresolved(dialog);
    await expect(refresh).toBeEnabled();
    fail = false;
    await refresh.click();
    await expect(dialog.locator('.review-empty')).toContainText('本次构建的待确认目录为空');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    expect(manifestCalls).toBe(2);
    expect(apiCalls).toBe(2);
  } finally { release(); }
});

test('retry remains available after the initial manifest request fails', async ({ page }) => {
  const asset = item('a', '重试恢复.png');
  let fail = true, manifestCalls = 0, apiCalls = 0;
  await page.route('**/resource-review/manifest.json', route => {
    manifestCalls++;
    return fail
      ? route.fulfill({ status: 503, json: { error: '诊断测试：批次清单暂时不可用' } })
      : route.fulfill({ json: manifest([asset], { ...emptyScan, files: 1, uniqueAssets: 1, images: 1, pending: 1 }) });
  });
  await page.route('**/api/resource-review*', route => {
    apiCalls++;
    return route.fulfill({ json: { namespace, rows: [row(asset, '已恢复云端备注')], next: null } });
  });
  const dialog = await openReview(page);
  await expect(dialog.getByRole('alert')).toContainText('诊断测试：批次清单暂时不可用');
  await expectUnresolved(dialog);
  expect(apiCalls).toBe(0);
  const refresh = dialog.getByRole('button', { name: '刷新云端状态', exact: true });
  await expect(refresh).toBeEnabled();
  fail = false;
  await refresh.click();
  await expect(dialog.getByRole('img', { name: '资源大图 重试恢复.png' })).toBeVisible();
  await expect(dialog.getByLabel('确认备注')).toHaveValue('已恢复云端备注');
  await expect(dialog.getByRole('button', { name: '标记可用', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(manifestCalls).toBe(2);
  expect(apiCalls).toBe(1);
});

test('refresh loads a newly published batch and reconciles selection when the previous asset disappears', async ({ page }) => {
  const first = item('a', '新批次一.png'), second = item('b', '新批次二.png');
  let current = manifest([], emptyScan), rows: ReviewRow[] = [], manifestCalls = 0;
  const requestedIds: (string | null)[] = [];
  await page.route('**/resource-review/manifest.json', route => {
    manifestCalls++;
    return route.fulfill({ json: current });
  });
  await page.route('**/api/resource-review*', route => {
    requestedIds.push(new URL(route.request().url()).searchParams.get('ids'));
    return route.fulfill({ json: { namespace, rows, next: null } });
  });
  const dialog = await openReview(page);
  await expect(dialog.locator('.review-empty')).toContainText('本次构建的待确认目录为空');
  const refresh = dialog.getByRole('button', { name: '刷新云端状态', exact: true });
  for (const asset of [first, second]) {
    current = manifest([asset], { ...emptyScan, files: 1, uniqueAssets: 1, images: 1, pending: 1 });
    rows = [row(asset, `备注：${asset.name}`)];
    await refresh.click();
    await expect(dialog.getByRole('button', { name: `查看 ${asset.name}`, exact: true })).toHaveClass('selected');
    await expect(dialog.getByRole('heading', { name: asset.name, exact: true })).toBeVisible();
    await expect(dialog.getByRole('img', { name: `资源大图 ${asset.name}` })).toBeVisible();
    await expect(dialog.getByLabel('确认备注')).toHaveValue(`备注：${asset.name}`);
    await expect(dialog.getByRole('button', { name: '标记可用', exact: true })).toBeEnabled();
    await expect(dialog.locator('.review-empty')).toHaveCount(0);
    await expect(dialog.locator('.review-toolbar small')).toContainText('本批次 1 项 · 未标记 1');
  }
  await expect(dialog.getByRole('button', { name: `查看 ${first.name}`, exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: first.name, exact: true })).toHaveCount(0);
  expect(manifestCalls).toBe(3);
  expect(requestedIds).toEqual([null, first.id, second.id]);
});
