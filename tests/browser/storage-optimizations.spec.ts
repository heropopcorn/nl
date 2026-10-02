import { expect, test, type Page } from '@playwright/test';
import { sample } from '../../packages/core';

const root = `/@fs/${process.cwd()}`;
const key = 'yuanli.web-director.v1';
const backupsKey = `${key}.backups`;

async function seed(page: Page, records: Record<string, unknown>) {
  await page.evaluate(async entries => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('yuanli-director', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('documents', 'readwrite');
        for (const [name, value] of Object.entries(entries)) transaction.objectStore('documents').put(value, name);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  }, records);
}

// Isolate persistence from the editor's automatic startup saves. Modules still
// run in a real browser/origin with the same IndexedDB and localStorage APIs.
test.beforeEach(async ({ page }) => {
  await page.route('**/__storage_test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>保存回归测试</title>' }));
  await page.goto('/__storage_test__');
});

test('failed saves remain dirty and guarded until a successful retry', async ({ page }) => {
  const result = await page.evaluate(async ({ root, project }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    const open = indexedDB.open;
    let message = '';
    indexedDB.open = (() => { throw new Error('模拟磁盘写入失败'); }) as typeof indexedDB.open;
    try { await storage.saveProject(project); } catch (error) { message = String(error); }
    finally { indexedDB.open = open; }
    const failed = { ...storage.previewSaveState(), pending: storage.hasPendingSaves() };
    await storage.saveProject(project);
    return { message, failed, recovered: { ...storage.previewSaveState(), pending: storage.hasPendingSaves() } };
  }, { root, project: sample });
  expect(result.message).toContain('模拟磁盘写入失败');
  expect(result.failed).toMatchObject({ dirty: true, saving: false, pending: true });
  expect(result.failed.error).toContain('模拟磁盘写入失败');
  expect(result.recovered).toEqual({ dirty: false, saving: false, error: '', pending: false });
});

for (const corrupt of [{ version: 99, shots: [] }, null]) {
  test(`unreadable stored project (${corrupt === null ? 'null' : 'invalid schema'}) never falls back to a fresh sample`, async ({ page }) => {
    await seed(page, { [key]: corrupt, [backupsKey]: [null, { id: 'broken', time: 123, project: { version: 99 } }] });
    const result = await page.evaluate(async ({ root, key }) => {
      const storage = await import(`${root}/apps/director-web/src/storage.ts`);
      localStorage.setItem(key, '{broken mirror');
      localStorage.setItem(`${key}.pending`, '{broken journal');
      try { return { error: '', loaded: await storage.loadProject(), mirror: localStorage.getItem(key), journal: localStorage.getItem(`${key}.pending`) }; }
      catch (error) { return { error: String(error), loaded: 'rejected', mirror: localStorage.getItem(key), journal: localStorage.getItem(`${key}.pending`) }; }
    }, { root, key });
    expect(result.error).toContain('不会用示例项目覆盖');
    expect(result.loaded).toBe('rejected');
    expect(result.mirror).toBe('{broken mirror');
    expect(result.journal).toBe('{broken journal');
  });
}

test('an explicitly stored null without mirrors is corrupt, not a new project', async ({ page }) => {
  await seed(page, { [key]: null });
  const message = await page.evaluate(async root => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    try { await storage.loadProject(); return ''; } catch (error) { return String(error); }
  }, root);
  expect(message).toContain('不会用示例项目覆盖');
});

test('an empty localStorage project record is retained and never treated as a fresh project', async ({ page }) => {
  const result = await page.evaluate(async ({ root, key }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    localStorage.setItem(key, '');
    localStorage.setItem(`${key}.pending`, '');
    let error = '';
    try { await storage.loadProject(); } catch (failure) { error = String(failure); }
    return { error, mirror: localStorage.getItem(key), journal: localStorage.getItem(`${key}.pending`) };
  }, { root, key });
  expect(result.error).toContain('不会用示例项目覆盖');
  expect(result.mirror).toBe('');
  expect(result.journal).toBe('');
});

test('damaged backups without a main project are retained and block fresh-project fallback', async ({ page }) => {
  const damaged = [null, { id: 'damaged-only-copy', time: 123, project: { version: 99 } }];
  await seed(page, { [backupsKey]: damaged });
  const result = await page.evaluate(async ({ root, backupsKey, key }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    let error = '';
    try { await storage.loadProject(); } catch (failure) { error = String(failure); }
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('yuanli-director', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const remaining = await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction('documents').objectStore('documents').get(backupsKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return { error, remaining, mirror: localStorage.getItem(key), journal: localStorage.getItem(`${key}.pending`) };
    } finally { database.close(); }
  }, { root, backupsKey, key });
  expect(result.error).toContain('不会用示例项目覆盖');
  expect(result.remaining).toEqual(damaged);
  expect(result.mirror).toBeNull();
  expect(result.journal).toBeNull();
});

test('backup recovery skips malformed entries and invalid timestamps', async ({ page }) => {
  const recovered = structuredClone(sample); recovered.shots[0].name = '可恢复的版本';
  await seed(page, {
    [key]: { version: 99 },
    [backupsKey]: [null, false, { id: 'invalid-project', time: 123, project: {} }, { id: 'invalid-time', time: 'not-a-time', project: sample }, { id: 'recoverable', time: 123, project: recovered }],
  });
  const result = await page.evaluate(async root => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    let recovered = false;
    const project = await storage.loadProject(() => { recovered = true; });
    const backups = await storage.listProjectBackups();
    return { recovered, name: project?.shots[0].name, backups: backups.map((backup: { id: string; time: number }) => ({ id: backup.id, time: backup.time })) };
  }, root);
  expect(result).toEqual({ recovered: true, name: '可恢复的版本', backups: [{ id: 'recoverable', time: 123 }] });
});

test('saving a checkpoint tolerates damaged history and still commits the latest project', async ({ page }) => {
  const next = structuredClone(sample); next.shots[0].name = '保存后的最新项目';
  await seed(page, { [key]: sample, [backupsKey]: [null, false, { project: {} }, { id: 'bad-time', time: 'invalid', project: sample }, { id: 'valid', time: 123, project: sample }] });
  const result = await page.evaluate(async ({ root, next }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    await storage.saveProject(next, true);
    const backups = await storage.listProjectBackups();
    return { name: (await storage.loadProject())?.shots[0].name, backups: backups.map((backup: { time: number; project: typeof next }) => ({ time: backup.time, name: backup.project.shots[0].name })), state: storage.previewSaveState(), pending: storage.hasPendingSaves() };
  }, { root, next });
  expect(result.name).toBe(next.shots[0].name);
  expect(result.backups).toHaveLength(2);
  expect(result.backups[0].name).toBe(next.shots[0].name);
  expect(result.backups.every((backup: { time: number }) => Number.isFinite(backup.time))).toBe(true);
  expect(result.state).toEqual({ dirty: false, saving: false, error: '' });
  expect(result.pending).toBe(false);
});

test('a save completing after another unsaved edit cannot clear the new dirty state', async ({ page }) => {
  const result = await page.evaluate(async ({ root, project }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    storage.markProjectDirty();
    const firstSave = storage.saveProject(project);
    // The next edit may be blocked from auto-saving, for example overlapping water.
    const newer = structuredClone(project); newer.shots[0].name = '尚未保存的后续编辑';
    storage.markProjectDirty();
    await firstSave;
    const afterOldSave = { ...storage.previewSaveState(), pending: storage.hasPendingSaves(), savedName: (await storage.loadProject())?.shots[0].name };
    await storage.saveProject(newer);
    return { afterOldSave, afterLatestSave: { ...storage.previewSaveState(), pending: storage.hasPendingSaves(), savedName: (await storage.loadProject())?.shots[0].name } };
  }, { root, project: sample });
  expect(result.afterOldSave).toMatchObject({ dirty: true, saving: false, pending: true, savedName: sample.shots[0].name });
  expect(result.afterLatestSave).toEqual({ dirty: false, saving: false, pending: false, error: '', savedName: '尚未保存的后续编辑' });
});

test('rapid queued saves preserve the latest snapshot and explicit checkpoints', async ({ page }) => {
  const result = await page.evaluate(async ({ root, project }) => {
    const storage = await import(`${root}/apps/director-web/src/storage.ts`);
    const first = structuredClone(project); first.shots[0].name = '中间状态';
    const checkpoint = structuredClone(project); checkpoint.shots[0].name = '显式检查点';
    const latest = structuredClone(project); latest.shots[0].name = '最终状态';
    await Promise.all([storage.saveProject(first), storage.saveProject(checkpoint, true), storage.saveProject(latest)]);
    return { name: (await storage.loadProject())?.shots[0].name, backups: (await storage.listProjectBackups()).map((backup: { project: typeof project }) => backup.project.shots[0].name), pending: storage.hasPendingSaves(), state: storage.previewSaveState() };
  }, { root, project: sample });
  expect(result.name).toBe('最终状态');
  expect(result.backups).toContain('显式检查点');
  expect(result.pending).toBe(false);
  expect(result.state).toEqual({ dirty: false, saving: false, error: '' });
});
