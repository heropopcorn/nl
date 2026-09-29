import { mkdir, readFile, rename, realpath, stat, lstat, readdir, open, unlink, mkdtemp, rm, rmdir } from 'node:fs/promises';
import os from 'node:os';
import { Readable } from 'node:stream';
import { packageStream, packageSize, readPackage } from './project-package.mjs';
import { createReadStream, createWriteStream } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { mediaReferences } from '../../packages/core/media-references.mjs';

const mediaName = /^[a-f0-9]{64}\.(png|jpg|webp|mp3|wav|ogg|flac|m4a|glb|mp4|webm|mov|mkv)$/;
const prefix = '/api/workspace/media/';
const mimeTypes = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'audio/mpeg':'mp3', 'audio/mp3':'mp3', 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/ogg':'ogg', 'audio/flac':'flac', 'audio/mp4':'m4a', 'model/gltf-binary':'glb', 'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov', 'video/x-matroska':'mkv' };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = text => createHash('sha256').update(text).digest('hex');
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(value)); };

export async function unlockWorkspace(directory) {
  const root=await realpath(directory), filename=path.join(root,'.workspace.lock');
  if((await lstat(filename)).isSymbolicLink()) throw new Error('锁文件不可为符号链接');
  const text=await readFile(filename,'utf8'), lock=JSON.parse(text);
  if(!Number.isInteger(lock.pid) || lock.pid<=0 || (lock.hostname && lock.hostname!==os.hostname())) throw new Error('无法安全确认锁的所属进程，请人工检查');
  try {process.kill(lock.pid,0);} catch(e) {if(e.code==='ESRCH') {
    if(await readFile(filename,'utf8')!==text) throw new Error('锁已发生变化');
    await unlink(filename); return;
  } throw e;}
  throw new Error('工作进程仍在运行，不能解除锁');
}

export async function createWorkspaceService(directory, validate) {
  await mkdir(directory, { recursive: true });
  const root = await realpath(directory), token = randomBytes(32).toString('hex');
  for (const folder of ['media', 'backups', 'exports', '.trash']) { await mkdir(path.join(root, folder), {recursive:true}); if (await realpath(path.join(root, folder)) !== path.join(root, folder)) throw new Error('工作区子目录不可使用符号链接'); }
  // Prevent two local servers from writing the same workspace. A crash leaves an
  // explicit lock to inspect/remove, rather than risking an automatic overwrite.
  const lock = await open(path.join(root, '.workspace.lock'), 'wx').catch(e => { if(e.code==='EEXIST') throw new Error('工作区已被占用：请关闭另一个工作进程；异常退出后可使用 --unlock 检查并解除残留锁'); throw e; });
  try { await lock.writeFile(JSON.stringify({ pid: process.pid, hostname:os.hostname(), started: new Date().toISOString() })); }
  catch(e) {await lock.close(); await unlink(path.join(root,'.workspace.lock')); throw e;}
  let queue = Promise.resolve(), lastBackup = 0;
  const exclusive = fn => { const result = queue.catch(() => {}).then(fn); queue = result; return result; };
  async function safeFile(relative) {
    const filename = path.join(root, relative);
    try { if ((await lstat(filename)).isSymbolicLink() || await realpath(filename) !== filename) throw fail('不允许符号链接', 403); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    return filename;
  }
  async function readProject() {
    const filename = await safeFile('project.json');
    try { const text = await readFile(filename, 'utf8'); return { project: toClient(JSON.parse(text)), revision: digest(text) }; }
    catch (e) { if (e.code === 'ENOENT') return {project:null, revision:'new'}; throw fail('项目文件损坏或无法读取；已停止自动保存，请从 backups 恢复', 422); }
  }
  function toClient(project) {
    const p = structuredClone(project);
    p.assets ??= [];
    if (!Array.isArray(p.assets)) throw fail('项目资源清单无效');
    mediaReferences(p).forEach(a => { if (a.src?.startsWith('media/')) { if (!mediaName.test(a.src.slice(6))) throw fail('资源路径无效'); a.src = prefix + a.src.slice(6); } });
    return validate(p);
  }
  async function toDisk(project) {
    const p = validate(project);
    for (const a of mediaReferences(p)) {
      if (a.src.startsWith(prefix)) {
        const name = a.src.slice(prefix.length); if (!mediaName.test(name)) throw fail('资源路径无效');
        if (!(await stat(await safeFile(`media/${name}`)).catch(() => { throw fail('项目引用的本地资源不存在'); })).isFile()) throw fail('项目素材不是文件');
        a.src = `media/${name}`;
      } else if (!/^\/art\/[a-z0-9_]+\.png$/.test(a.src)) throw fail('请先将嵌入式素材上传到工作目录');
    }
    return p;
  }
  async function body(req) {
    const parts = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw fail('项目文档过大', 413); parts.push(chunk); }
    return JSON.parse(Buffer.concat(parts).toString());
  }
  async function atomic(filename, text) {
    const temp = `${filename}.${randomBytes(8).toString('hex')}.tmp`, handle = await open(temp, 'wx');
    try {
      try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, filename);
    } finally { await unlink(temp).catch(() => {}); }
  }
  const backupPattern=/^\d+-[a-f0-9]+\.json$/;
  async function maintenance(keep) {
    if(!Number.isInteger(keep) || keep<1 || keep>500) throw fail('保留份数必须为 1–500');
    const current=await readProject(), names=(await readdir(path.join(root,'backups'))).filter(n=>backupPattern.test(n)).sort().reverse();
    const refs=new Set(), candidates=[]; let mediaBytes=0,backupBytes=0;
    const reference=p=>{if(p) mediaReferences(p).forEach(a=>{if(a.src.startsWith(prefix)) refs.add(a.src.slice(prefix.length));});};
    reference(current.project);
    for(let i=0;i<names.length;i++) {
      const filename=await safeFile(`backups/${names[i]}`), text=await readFile(filename,'utf8');
      const p=toClient(JSON.parse(text)); // Abort cleanup if any history is unreadable.
      backupBytes+=Buffer.byteLength(text);
      if(i<keep) reference(p); else candidates.push(`backups/${names[i]}`);
    }
    for(const name of await readdir(path.join(root,'media'))) {
      if(!mediaName.test(name)) continue;
      const info=await stat(await safeFile(`media/${name}`)); if(!info.isFile()) continue;
      mediaBytes+=info.size;
      // Leave recent imports alone, including an upload not yet committed to JSON.
      if(!refs.has(name) && Date.now()-info.mtimeMs>24*60*60*1000) candidates.push(`media/${name}`);
    }
    let reclaimable=0;
    for(const name of candidates) reclaimable+=(await stat(await safeFile(name))).size;
    const trash=[];
    for(const id of await readdir(path.join(root,'.trash'))) {
      if(!/^\d+-[a-f0-9]+$/.test(id)) continue;
      await safeFile(`.trash/${id}`);
      let bytes=0; for(const name of await readdir(path.join(root,'.trash',id))) bytes+=(await stat(await safeFile(`.trash/${id}/${name}`))).size;
      trash.push({id,bytes});
    }
    const signature=digest(JSON.stringify({revision:current.revision,keep,candidates}));
    return {revision:current.revision,keep,mediaBytes,backupBytes,backupCount:names.length,candidates,reclaimable,signature,trash};
  }
  async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/workspace')) return false;
    try {
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw fail('工作区服务仅允许本机访问', 403);
      if (!['GET','HEAD'].includes(req.method) && (req.headers.origin !== url.origin || req.headers['x-workspace-token'] !== token)) throw fail('无效的工作区请求来源或令牌', 403);
      if (req.method === 'GET' && url.pathname === '/api/workspace') { json(res,200,{mode:'local',directory:root,token}); return true; }
      if (req.method === 'GET' && url.pathname === '/api/workspace/project') { json(res,200,await readProject()); return true; }
      if (req.method === 'PUT' && url.pathname === '/api/workspace/project') {
        const incoming = await body(req);
        const result = await exclusive(async () => {
          const current = await readProject();
          if (incoming.revision !== current.revision) throw fail('项目已被其他窗口修改，自动保存已停止；请先导出当前修改，再刷新读取最新版本', 409);
          const disk = await toDisk(incoming.project), text = JSON.stringify(disk, null, 2);
          if (current.project && (incoming.checkpoint || Date.now() - lastBackup >= 60_000)) {
            const old = await readFile(await safeFile('project.json'), 'utf8');
            await atomic(path.join(root, 'backups', `${Date.now()}-${randomBytes(6).toString('hex')}.json`), old); lastBackup = Date.now();
          }
          await atomic(await safeFile('project.json'), text);
          return { revision: digest(text) };
        }); json(res,200,result); return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/workspace/backups') {
        const list = [];
        for (const name of (await readdir(path.join(root,'backups'))).filter(n=>/^\d+-[a-f0-9]+\.json$/.test(n)).sort().reverse().slice(0,50)) {
          try { list.push({id:name,time:Number(name.split('-')[0]),project:toClient(JSON.parse(await readFile(await safeFile(`backups/${name}`),'utf8')))}); } catch { /* skip damaged historical snapshot */ }
        }
        json(res,200,list); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/workspace/package/export') {
        const incoming=await body(req);
        await exclusive(async()=>{
          const disk=await toDisk(incoming.project), files=[];
          for(const name of new Set(mediaReferences(disk).map(a=>a.src).filter(src=>src.startsWith('media/')))) {
            const filename=await safeFile(name), info=await stat(filename); files.push({name,filename,size:info.size});
          }
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="director-project.nlpack"','Content-Length':packageSize(disk,files),'Cache-Control':'no-store'});
          await pipeline(Readable.from(packageStream(disk,files)),res);
        }); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/workspace/package/import') {
        const result=await exclusive(async()=>{
          const current=await readProject();
          if(req.headers['x-workspace-revision']!==current.revision) throw fail('项目版本冲突，请先导出修改，不可覆盖',409);
          const staging=await mkdtemp(path.join(root,'.import-'));
          try {
            const imported=await readPackage(req,staging,p=>{
              const parsed=toClient(p);
              if(mediaReferences(parsed).some(a=>!a.src.startsWith(prefix) && !/^\/art\/[a-z0-9_]+\.png$/.test(a.src))) throw fail('项目包包含非法资源');
              mediaReferences(parsed).forEach(a=>{if(a.src.startsWith(prefix)) a.src='media/'+a.src.slice(prefix.length);}); return parsed;
            });
            if((await readProject()).revision!==current.revision) throw fail('导入期间项目发生变化，请重试',409);
            for(const file of imported.files) {
              const target=await safeFile(file.name);
              try {
                await stat(target);
                const hash=createHash('sha256'); for await(const chunk of createReadStream(target)) hash.update(chunk);
                if(hash.digest('hex')!==path.basename(file.name).split('.')[0]) throw fail('已有同名素材损坏，请先检查工作目录');
              } catch(e) {if(e.code!=='ENOENT') throw e; await rename(file.filename,target);}
            }
            const disk=await toDisk(toClient(imported.project));
            if(current.project) await atomic(path.join(root,'backups',`${Date.now()}-${randomBytes(6).toString('hex')}.json`),await readFile(await safeFile('project.json'),'utf8'));
            const text=JSON.stringify(disk,null,2); await atomic(await safeFile('project.json'),text);
            return {project:toClient(disk),revision:digest(text)};
          } finally {await rm(staging,{recursive:true,force:true});}
        }); json(res,200,result); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/workspace/maintenance/plan') {
        const input=await body(req); json(res,200,await exclusive(()=>maintenance(input.keep))); return true;
      }
      if(req.method==='POST' && url.pathname==='/api/workspace/maintenance/clean') {
        const input=await body(req);
        const result=await exclusive(async()=>{
          const plan=await maintenance(input.keep);
          if(plan.signature!==input.signature) throw fail('项目或备份已变化，请重新检查清理清单',409);
          if(!plan.candidates.length) return {moved:0};
          const id=`${Date.now()}-${randomBytes(6).toString('hex')}`, trash=path.join(root,'.trash',id);
          await mkdir(trash);
          for(const relative of plan.candidates) await rename(await safeFile(relative),path.join(trash,relative.replace('/','__')));
          return {moved:plan.candidates.length,id};
        }); json(res,200,result); return true;
      }
      if(req.method==='POST' && ['/api/workspace/maintenance/restore','/api/workspace/maintenance/purge'].includes(url.pathname)) {
        const input=await body(req);
        await exclusive(async()=>{
          if(!/^\d+-[a-f0-9]+$/.test(input.id)) throw fail('回收批次无效');
          const trash=await safeFile(`.trash/${input.id}`);
          const names=await readdir(trash);
          for(const name of names) {
            const [folder,filename]=name.split('__');
            if(!(folder==='media' && mediaName.test(filename) || folder==='backups' && backupPattern.test(filename))) throw fail('回收区包含未知文件，请人工检查');
            const source=await safeFile(`.trash/${input.id}/${name}`);
            if(url.pathname.endsWith('/restore')) {
              const target=await safeFile(`${folder}/${filename}`);
              try {await stat(target); throw fail('目标文件已存在，未覆盖，请人工检查');} catch(e) {if(e.code!=='ENOENT') throw e;}
              await rename(source,target);
            } else { if(input.confirm!=='永久删除') throw fail('必须确认永久删除'); await unlink(source); }
          }
          await rmdir(trash);
        }); json(res,200,{ok:true}); return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/workspace/media') {
        const mime = req.headers['content-type']?.split(';')[0], ext = mimeTypes[mime]; if (!ext) throw fail('不支持的素材类型');
        const temp = path.join(root,'media',`${randomBytes(16).toString('hex')}.tmp`), hash = createHash('sha256'); let size=0;
        try {
          const meter = new Transform({ transform(chunk, _, callback) { size += chunk.length; if(size > 512 * 1024 * 1024) { callback(fail('单个文件超过 512MB',413)); return; } hash.update(chunk); callback(null,chunk); } });
          await pipeline(req, meter, createWriteStream(temp, {flags:'wx'}));
          if (!size) throw fail('文件为空');
          const handle=await open(temp,'r+'); try {await handle.sync();} finally {await handle.close();}
          const name = `${hash.digest('hex')}.${ext}`, target = await safeFile(`media/${name}`);
          try { await stat(target); await unlink(temp); } catch(e) { if(e.code !== 'ENOENT') throw e; await rename(temp,target); }
          json(res,201,{src:prefix+name,size});
        } finally { await unlink(temp).catch(()=>{}); } return true;
      }
      if (['GET','HEAD'].includes(req.method) && url.pathname.startsWith(prefix)) {
        const name=url.pathname.slice(prefix.length); if (!mediaName.test(name)) throw fail('无效资源路径',404);
        const filename=await safeFile(`media/${name}`), info=await stat(filename);
        if (!info.isFile()) throw fail('资源不存在',404);
        const type=Object.entries(mimeTypes).find(([,ext])=>name.endsWith(`.${ext}`))?.[0] || 'application/octet-stream';
        let start=0, end=info.size-1, status=200;
        if (req.headers.range) {
          const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if(!match || (!match[1] && !match[2])) throw fail('无效字节范围',416);
          start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
          end=match[1] && match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;
          if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=info.size) throw fail('字节范围越界',416);
          status=206;
        }
        res.writeHead(status,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`} : {}),'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
        if(req.method==='HEAD') res.end(); else createReadStream(filename,{start,end}).on('error',()=>res.destroy()).pipe(res); return true;
      }
      throw fail('未知工作区接口',404);
    } catch (e) { if (!res.headersSent && !res.destroyed) json(res,e.status || 400,{error:e.message}); return true; }
  }
  return { handler, directory: root, close: async () => { await queue.catch(()=>{}); await lock.close(); await unlink(path.join(root,'.workspace.lock')); } };
}
