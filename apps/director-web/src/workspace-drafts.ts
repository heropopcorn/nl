import type { Project } from '../../../packages/core';
export type Draft = { id: string; directory: string; revision: string; project: Project; time: number };
let session = '';
function tabId() {
  if (!session) {
    try { session = sessionStorage.getItem('nl-workspace-tab') || crypto.randomUUID(); sessionStorage.setItem('nl-workspace-tab', session); }
    catch { session = crypto.randomUUID(); }
  }
  return session;
}
export const draftId = (directory: string) => `${directory}\n${tabId()}`;
async function db() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const r = indexedDB.open('nl-workspace-recovery', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', {keyPath:'id'});
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
let queue = Promise.resolve();
export function writeDraft(draft: Draft | null, id: string) {
  const task = queue.catch(()=>{}).then(async () => {
    const database = await db();
    try { await new Promise<void>((resolve,reject) => {
      const tx = database.transaction('drafts','readwrite'), store = tx.objectStore('drafts');
      if (draft) store.put(draft); else store.delete(id);
      tx.oncomplete=()=>resolve(); tx.onerror=tx.onabort=()=>reject(tx.error);
    }); } finally { database.close(); }
  });
  queue=task; return task;
}
export async function listDrafts(directory: string): Promise<Draft[]> {
  await queue.catch(()=>{});
  const database = await db();
  try { return await new Promise((resolve,reject) => {
    const r = database.transaction('drafts').objectStore('drafts').getAll();
    r.onsuccess=()=>resolve(r.result.filter((d:Draft)=>d.directory===directory).sort((a:Draft,b:Draft)=>b.time-a.time));
    r.onerror=()=>reject(r.error);
  }); } finally { database.close(); }
}
