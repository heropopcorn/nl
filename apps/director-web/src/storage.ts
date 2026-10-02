import { projectSchema, type Project } from '../../../packages/core';
import { isLocalWork } from './runtime';
import { loadWorkspace, saveWorkspace, workspaceBackups, workspacePending, uploadWorkspaceMedia } from './workspace-storage';
const KEY = 'yuanli.web-director.v1';
const BACKUPS = `${KEY}.backups`;
const PENDING = `${KEY}.pending`;
export type ProjectBackup = { id: string; time: number; project: Project };
let previewState = { dirty: false, saving: false, error: '' };
let dirtyGeneration = 0;
const listeners = new Set<() => void>();
export const previewSaveState = () => previewState;
export const subscribePreviewSave = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
function updatePreview(value: Partial<typeof previewState>) { previewState = { ...previewState, ...value }; listeners.forEach(notify => notify()); }
export function markProjectDirty() { if (!isLocalWork()) { dirtyGeneration++; updatePreview({ dirty: true }); } }
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const req = indexedDB.open('yuanli-director', 1); req.onupgradeneeded = () => req.result.createObjectStore('documents'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function read(key: string): Promise<unknown> {
  const store = await db();
  try { return await new Promise((resolve, reject) => { const request = store.transaction('documents').objectStore('documents').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { store.close(); }
}
function validBackups(raw: unknown): ProjectBackup[] {
  return (Array.isArray(raw) ? raw : []).flatMap(item => { const p = projectSchema.safeParse(item?.project); return p.success && typeof item.id === 'string' && Number.isFinite(item.time) ? [{ id: item.id, time: item.time, project: p.data }] : []; });
}
export async function listProjectBackups(): Promise<ProjectBackup[]> {
  if (isLocalWork()) return workspaceBackups();
  return validBackups(await read(BACKUPS));
}
export async function loadProject(onRecovered?: () => void): Promise<Project | null> {
  if (isLocalWork()) return loadWorkspace();
  // Small edits have a synchronous write-ahead journal: a refresh must not lose
  // an edit whose IndexedDB transaction was interrupted by page teardown.
  let foundDocument = false;
  try { const pending = localStorage.getItem(PENDING); if (pending !== null) { foundDocument = true; const p = projectSchema.safeParse(JSON.parse(pending)); if (p.success) return p.data; } } catch { /* Fall back to durable storage. */ }
  // IndexedDB is authoritative; localStorage may be a stale mirror after quota errors.
  let failure: unknown;
  try { const raw = await read(KEY); foundDocument ||= raw !== undefined; const p = projectSchema.safeParse(raw); if (p.success) return p.data; } catch (error) { failure = error; }
  try { const local = localStorage.getItem(KEY); if (local !== null) { foundDocument = true; const p = projectSchema.safeParse(JSON.parse(local)); if (p.success) return p.data; } } catch { /* Try historical snapshots next. */ }
  try { const raw = await read(BACKUPS); foundDocument ||= raw !== undefined; const backups = validBackups(raw); if (backups.length) { onRecovered?.(); return backups[0].project; } } catch (error) { failure = error; }
  if (failure) throw failure;
  if (foundDocument) throw new Error('发现无法读取的项目，且没有可用备份。已保留原始数据，不会用示例项目覆盖。');
  return null;
}
let queue = Promise.resolve();
let revision = 0, pendingSaves = 0;
export const hasPendingSaves = () => pendingSaves > 0 || previewState.dirty || workspacePending();
export function saveProject(project: Project, checkpoint = false) {
  if (isLocalWork()) return saveWorkspace(project, checkpoint);
  const snapshot = projectSchema.parse(project), json = JSON.stringify(snapshot);
  const currentRevision = ++revision;
  const savedGeneration = ++dirtyGeneration;
  pendingSaves++;
  updatePreview({ dirty: true, saving: true });
  if (json.length < 2_000_000) {
    try { localStorage.setItem(PENDING, json); localStorage.setItem(KEY, json); } catch { /* Do not claim durability before the database commits. */ }
  } else {
    // An old small-project journal must never override a newer large project.
    try { localStorage.removeItem(PENDING); } catch { /* Closing is guarded below. */ }
  }
  const job = queue.catch(() => {}).then(async () => {
    if (!checkpoint && currentRevision !== revision) return;
    const store = await db();
    try { await new Promise<void>((resolve, reject) => {
      const transaction = store.transaction('documents', 'readwrite'), documents = transaction.objectStore('documents');
      const old = documents.get(KEY), history = documents.get(BACKUPS);
      history.onsuccess = () => {
        const backups = validBackups(history.result);
        const previous = projectSchema.safeParse(old.result);
        const candidate = checkpoint ? snapshot : previous.success ? previous.data : null;
        if (candidate && (checkpoint || !backups.length || Date.now() - backups[0].time >= 60_000) && (checkpoint || JSON.stringify(candidate) !== json)) {
          backups.unshift({ id: crypto.randomUUID(), time: Date.now(), project: candidate });
          // Bound both count and bytes; a large project still keeps one recoverable copy.
          backups.splice(5);
          while (backups.length > 1 && JSON.stringify(backups).length > 150_000_000) backups.pop();
          documents.put(backups, BACKUPS);
        }
        documents.put(snapshot, KEY);
      };
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    }); } finally { store.close(); }
    if (revision === currentRevision) {
      try { if (json.length < 2_000_000) localStorage.setItem(KEY, json); else localStorage.removeItem(KEY); localStorage.removeItem(PENDING); } catch { /* Durable copy committed successfully. */ }
      if (savedGeneration === dirtyGeneration) updatePreview({ dirty: false, error: '' });
    }
  }).catch(error => { if (currentRevision === revision) updatePreview({ dirty: true, error: String(error) }); throw error; }).finally(() => { pendingSaves--; updatePreview({ saving: pendingSaves > 0 }); }); queue = job; return job;
}
export async function importMedia(file: File, category: Project['assets'][number]['category']) {
  const maxMB=isLocalWork()?512:20;
  if (file.size > maxMB * 1024 * 1024) throw new Error(`单个资源最大 ${maxMB}MB`);
  if (category === 'models') {
    const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('请选择有效的 GLB 2.0 模型');
    const jsonLength = view.getUint32(12, true); const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
    if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri)) throw new Error('GLB 必须包含全部纹理和数据，不支持外部资源引用');
    const src = isLocalWork() ? await uploadWorkspaceMedia(new Blob([bytes], {type:'model/gltf-binary'})) : await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(`data:model/gltf-binary;base64,${String(r.result).split(',')[1]}`); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    return { id: crypto.randomUUID(), name: file.name, category, src, width: 1, height: 1, columns: 1, rows: 1, fps: 12 };
  }
  const audio = category === 'audio';
  if (audio ? !/^audio\//.test(file.type) : !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('请选择 PNG/JPEG/WebP 图片，或音频文件');
  if (isLocalWork()) {
    let width = 1, height = 1;
    if (!audio) { const url = URL.createObjectURL(file); try { const image = new Image(); image.src = url; await image.decode(); width=image.naturalWidth; height=image.naturalHeight; if(width>8192 || height>8192) throw new Error('图片单边不可超过 8192 像素'); } finally { URL.revokeObjectURL(url); } }
    const src = await uploadWorkspaceMedia(file);
    return {id:crypto.randomUUID(),name:file.name,category,src,width,height,columns:1,rows:1,fps:12};
  }
  const src = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
  let width = 1, height = 1;
  if (!audio) { const image = new Image(); image.src = src; await image.decode(); width = image.naturalWidth; height = image.naturalHeight; if (width > 8192 || height > 8192) throw new Error('图片单边不可超过 8192 像素'); }
  return { id: crypto.randomUUID(), name: file.name, category, src, width, height, columns: 1, rows: 1, fps: 12 };
}
