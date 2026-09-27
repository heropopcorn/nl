import { projectSchema, type Project } from '../../../packages/core';
const KEY = 'yuanli.web-director.v1';
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const req = indexedDB.open('yuanli-director', 1); req.onupgradeneeded = () => req.result.createObjectStore('documents'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
export async function loadProject(): Promise<Project | null> {
  const local = localStorage.getItem(KEY);
  if (local) { try { return projectSchema.parse(JSON.parse(local)); } catch { /* Keep invalid source untouched; try the last durable copy. */ } }
  const store = await db();
  try { return await new Promise((resolve, reject) => { const request = store.transaction('documents').objectStore('documents').get(KEY); request.onsuccess = () => { const p = projectSchema.safeParse(request.result); resolve(p.success ? p.data : null); }; request.onerror = () => reject(request.error); }); } finally { store.close(); }
}
let queue = Promise.resolve();
export function saveProject(project: Project) {
  const json = JSON.stringify(project);
  if (json.length < 2_000_000) { try { localStorage.setItem(KEY, json); } catch { /* IndexedDB remains authoritative. */ } }
  const job = queue.catch(() => {}).then(async () => {
    const store = await db();
    try { await new Promise<void>((resolve, reject) => { const transaction = store.transaction('documents', 'readwrite'); transaction.objectStore('documents').put(project, KEY); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); } finally { store.close(); }
    if (json.length >= 2_000_000) localStorage.removeItem(KEY);
  }); queue = job; return job;
}
export async function importMedia(file: File, category: Project['assets'][number]['category']) {
  if (file.size > 20 * 1024 * 1024) throw new Error('单个资源最大 20MB');
  if (category === 'models') {
    const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('请选择有效的 GLB 2.0 模型');
    const jsonLength = view.getUint32(12, true); const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
    if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri)) throw new Error('GLB 必须包含全部纹理和数据，不支持外部资源引用');
    const src = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(`data:model/gltf-binary;base64,${String(r.result).split(',')[1]}`); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    return { id: crypto.randomUUID(), name: file.name, category, src, width: 1, height: 1, columns: 1, rows: 1, fps: 12 };
  }
  const audio = category === 'audio';
  if (audio ? !/^audio\//.test(file.type) : !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('请选择 PNG/JPEG/WebP 图片，或音频文件');
  const src = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
  let width = 1, height = 1;
  if (!audio) { const image = new Image(); image.src = src; await image.decode(); width = image.naturalWidth; height = image.naturalHeight; if (width > 8192 || height > 8192) throw new Error('图片单边不可超过 8192 像素'); }
  return { id: crypto.randomUUID(), name: file.name, category, src, width, height, columns: 1, rows: 1, fps: 12 };
}
