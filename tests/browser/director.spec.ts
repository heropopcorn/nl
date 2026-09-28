import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
test('two studios, persisted edits, deterministic seek and PNG output', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  const preview = page.getByLabel('影棚预览');
  const first = await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole('button', { name: '03 五行 · 相生' }).click();
  const motion = await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL()); expect(motion).not.toBe(first);
  await page.getByRole('button', { name: '01 村庄 · 出发' }).click();
  await expect.poll(() => preview.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(first);
  await page.getByRole('button', { name: '主角（占位贴图）' }).click();
  await page.getByLabel('元素名称').fill('小明');
  await page.reload(); await expect(page.getByRole('status')).toContainText('影棚已就绪');
  await expect(page.getByRole('button', { name: '♙ 小明' })).toBeVisible();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '保存当前帧 PNG' }).click();
  expect((await pending).suggestedFilename()).toMatch(/\.png$/);
  await page.screenshot({ path: 'test-results/director.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('offline renderer crosses studios without changing the live editor', async ({page})=>{
 await page.goto('/');await expect(page.locator('footer')).toContainText('影棚已就绪');
 const before=await page.getByLabel('影棚预览').evaluate((c:HTMLCanvasElement)=>c.toDataURL());
 const result=await page.evaluate(async url=>{
 const {DirectorRenderer}=await import(url+'/packages/studios/index.ts');const {sample}=await import(url+'/packages/core/index.ts');
 const r=await DirectorRenderer.create(),c=Object.assign(document.createElement('canvas'),{width:1280,height:720});
 try{await r.prepare(sample,350);r.render(sample,350,c);const a=c.toDataURL();await r.prepare(sample,360);r.render(sample,360,c);const b=c.toDataURL();r.render(sample,350,c);return{a,b,again:c.toDataURL()};}finally{r.dispose();}
 },'/@fs/'+process.cwd());
 expect(result.a).not.toBe(result.b);expect(result.again).toBe(result.a);expect(await page.getByLabel('影棚预览').evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(before);
});
