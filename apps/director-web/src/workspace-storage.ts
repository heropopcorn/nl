import { projectSchema, type Project } from '../../../packages/core';
import { mediaReferences } from '../../../packages/core/media-references.mjs';
import { draftId, listDrafts, writeDraft, type Draft } from './workspace-drafts';
const prefix = '/api/workspace/media/';
let token = '', revision = '', directory = '', stopped = false;
let queue = Promise.resolve(), pending = 0, generation = 0;
let state = { dirty:false, error:'', authRequired:false, conflict:false, draftError:'' };
export const workspaceState = () => state;
function update(value: Partial<typeof state>) { state={...state,...value}; window.dispatchEvent(new Event('workspace-state')); }
export const workspacePending = () => pending > 0 || state.dirty;
export const workspaceDirectory = () => directory;
class WorkspaceError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function checkWorkspaceResponse(res: Response, media = false) {
  if (res.status === 401 || res.redirected) {
    update({authRequired:true}); throw new WorkspaceError('登录已过期，请在新窗口登录，再重试；不要刷新此编辑器',401);
  }
  if (!res.ok) throw new WorkspaceError((await res.json().catch(()=>({}))).error || `本地服务不可用（${res.status}）`,res.status);
  const type = res.headers.get('content-type') || '';
  if (media ? !/^(image\/(png|jpeg|webp)|audio\/|video\/|model\/gltf-binary|application\/octet-stream)/.test(type) : !type.includes('application/json')) throw new Error('服务返回了错误的数据类型，已停止操作');
  return res;
}
export async function workspaceRequest(route: string, method = 'GET', value?: unknown) {
  const res = await fetch('/api/workspace' + route, { method, headers: { 'Content-Type':'application/json', 'X-Workspace-Token': token }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  await checkWorkspaceResponse(res); return res.json();
}
export const workspaceHeaders = () => ({'X-Workspace-Token':token, 'X-Workspace-Revision':revision});
export async function loadWorkspace() {
  const info = await workspaceRequest(''); token = info.token; directory = info.directory;
  const result = await workspaceRequest('/project');
  const project = result.project ? projectSchema.parse(result.project) : null;
  revision = result.revision; stopped = false;
  update({dirty:false,error:'',authRequired:false,conflict:false});
  const drafts=await listDrafts(directory).catch(()=>[]), own=drafts.find(d=>d.id===draftId(directory));
  if(own && JSON.stringify(own.project)!==JSON.stringify(project)) {
    if(confirm('发现此窗口未保存的恢复草稿。是否恢复？若磁盘版本已变化，将阻止覆盖，您仍可导出草稿。')) return recoverWorkspaceDraft(own);
    // Declining recovery does not destroy the draft when the initial autosave runs.
    const archived={...own,id:own.id+':archived:'+Date.now()}; await writeDraft(archived,archived.id);
  }
  return project;
}
export const workspaceDrafts = () => listDrafts(directory);
export function recoverWorkspaceDraft(draft: Draft) {
  if (draft.directory !== directory) throw new Error('草稿不属于当前工作区');
  const project = projectSchema.parse(draft.project);
  // Restoring an old draft must not bypass the original revision check.
  revision=draft.revision; stopped=false; markWorkspaceDirty(project); return project;
}
export function markWorkspaceDirty(project: Project) {
  const current = ++generation;
  update({dirty:true});
  if (directory) void writeDraft({id:draftId(directory),directory,revision,project:structuredClone(project),time:Date.now()},draftId(directory))
    .then(()=>{if(current===generation) update({draftError:''});})
    .catch(()=>update({draftError:'浏览器恢复草稿写入失败，请勿关闭页面，并导出备份'}));
  return current;
}
export async function uploadWorkspaceMedia(blob: Blob) {
  if (!token) throw new Error('本地工作区尚未就绪');
  const res = await fetch('/api/workspace/media', {method:'POST',headers:{'Content-Type':blob.type,'X-Workspace-Token':token},body:blob});
  await checkWorkspaceResponse(res); return (await res.json()).src as string;
}
const migrated = new Map<string, string>();
export async function externalizeProject(project: Project, verifyReferences = false): Promise<Project> {
  const copy = structuredClone(project);
  for (const asset of mediaReferences(copy)) {
    if (verifyReferences && asset.src.startsWith(prefix)) {
      await checkWorkspaceResponse(await fetch(asset.src, {method:'HEAD'}),true);
    }
    if (!asset.src.startsWith('data:')) continue;
    // Do not retain large base64 strings in a process-wide cache.
    const blob = await (await fetch(asset.src)).blob();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('') + blob.type;
    if (!migrated.has(hash)) migrated.set(hash, await uploadWorkspaceMedia(blob));
    asset.src = migrated.get(hash)!;
  }
  return projectSchema.parse(copy);
}
export function saveWorkspace(project: Project, checkpoint = false, retry = false) {
  pending++;
  const snapshot = structuredClone(project), current = markWorkspaceDirty(snapshot);
  const task = queue.catch(()=>{}).then(async () => {
    if (current !== generation && !checkpoint) return;
    try {
      if (retry && !state.conflict) {
        const info = await workspaceRequest('');
        if(info.directory !== directory) throw new Error('服务已切换工作目录，请先导出当前修改');
        token=info.token; stopped=false;
      }
      if (stopped || !revision) throw new Error('磁盘保存已停止，请重试；版本冲突时请先导出修改');
      const next = await externalizeProject(snapshot);
      const result = await workspaceRequest('/project','PUT',{project:next,revision,checkpoint}); revision = result.revision;
      if (current===generation) {
        await writeDraft(null,draftId(directory)).catch(()=>{});
        if (current===generation) update({dirty:false,error:'',authRequired:false,conflict:false});
      }
    } catch(e) {
      stopped = true; update({error:String(e),conflict:state.conflict || (e instanceof WorkspaceError && e.status===409)}); throw e;
    }
  }).finally(()=>{pending--;});
  queue = task; return task;
}
export async function workspaceBackups() { return workspaceRequest('/backups'); }
export async function importWorkspacePackage(file: File) {
  await queue.catch(()=>{}); pending++;
  try {
    const res=await fetch('/api/workspace/package/import',{method:'POST',headers:{...workspaceHeaders(),'Content-Type':'application/octet-stream'},body:file});
    await checkWorkspaceResponse(res); const result=await res.json();
    const project=projectSchema.parse(result.project); revision=result.revision; stopped=false; migrated.clear();
    await writeDraft(null,draftId(directory)).catch(()=>update({draftError:'项目已导入，但旧浏览器草稿未能清理；恢复旧草稿前请核对版本'}));
    update({dirty:false,error:'',authRequired:false,conflict:false}); return project;
  } finally {pending--;}
}
export async function portableProject(project: Project) {
  if (project.spriteDrafts.length) throw new Error('项目包含视频制作草稿，请使用本地项目包导出，以保留原视频和逐帧文件');
  const copy = structuredClone(project);
  let estimated = JSON.stringify(copy).length;
  for (const asset of copy.assets) if (asset.src.startsWith(prefix)) {
    const res = await checkWorkspaceResponse(await fetch(asset.src),true);
    const size = Number(res.headers.get('content-length'));
    if(size && Math.ceil(size/3)*4+128>30_000_000) {await res.body?.cancel();throw new Error('单个素材超过旧版 JSON 格式上限，请使用本地项目包');}
    if (size && estimated + Math.ceil(size/3)*4 > 140_000_000) { await res.body?.cancel(); throw new Error('项目过大，请使用本地项目包，不再导出无法重新导入的 JSON'); }
    const blob = await res.blob(); estimated += Math.ceil(blob.size/3)*4;
    if(Math.ceil(blob.size/3)*4+128>30_000_000) throw new Error('单个素材超过旧版 JSON 格式上限，请使用本地项目包');
    if (estimated > 140_000_000) throw new Error('项目过大，请使用本地项目包');
    asset.src = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(blob); });
  }
  const valid = projectSchema.parse(copy);
  if (new Blob([JSON.stringify(valid,null,2)]).size > 150_000_000) throw new Error('项目 JSON 超过导入上限，请使用本地项目包');
  return valid;
}
