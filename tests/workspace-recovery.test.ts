import { beforeEach, expect, test, vi } from 'vitest';
import { sample } from '../packages/core';
vi.mock('../apps/director-web/src/workspace-drafts',()=>({draftId:()=>'/test/tab',listDrafts:async()=>[],writeDraft:async()=>{}}));
beforeEach(()=>{
  vi.resetModules();
  vi.stubGlobal('window',new EventTarget());
});
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('failed save stays dirty after requests settle; retry preserves version checks',async()=>{
  let fail=true, puts=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
    if(url==='/api/workspace') return json({token:'test',directory:'/test'});
    if(options?.method==='PUT') {puts++; if(fail) throw new Error('connection lost'); return json({revision:'second'});}
    return json({project:sample,revision:'first'});
  }));
  const storage=await import('../apps/director-web/src/workspace-storage');
  await storage.loadWorkspace();
  await expect(storage.saveWorkspace(sample)).rejects.toThrow('connection lost');
  expect(storage.workspacePending()).toBe(true); expect(storage.workspaceState().dirty).toBe(true);
  fail=false; await storage.saveWorkspace(sample,false,true);
  expect(puts).toBe(2); expect(storage.workspacePending()).toBe(false);
});
test('conflicts cannot be cleared by clicking retry',async()=>{
  let puts=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
    if(url==='/api/workspace') return json({token:'test',directory:'/test'});
    if(options?.method==='PUT') {puts++;return json({error:'version conflict'},409);}
    return json({project:sample,revision:'first'});
  }));
  const storage=await import('../apps/director-web/src/workspace-storage'); await storage.loadWorkspace();
  await expect(storage.saveWorkspace(sample)).rejects.toThrow('version conflict');
  await expect(storage.saveWorkspace(sample,false,true)).rejects.toThrow('磁盘保存已停止');
  expect(puts).toBe(1); expect(storage.workspaceState().conflict).toBe(true); expect(storage.workspacePending()).toBe(true);
});
test('portable export rejects login HTML and expired authentication',async()=>{
  const p=structuredClone(sample); p.assets.push({id:'custom',name:'custom',src:'/api/workspace/media/'+'a'.repeat(64)+'.png',category:'trees',width:1,height:1,columns:1,rows:1,fps:12});
  const storage=await import('../apps/director-web/src/workspace-storage');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}})));
  await expect(storage.portableProject(p)).rejects.toThrow('数据类型');
  vi.stubGlobal('fetch',vi.fn(async()=>json({error:'expired'},401)));
  await expect(storage.portableProject(p)).rejects.toThrow('登录已过期'); expect(storage.workspaceState().authRequired).toBe(true);
});
test('JSON export rejects an oversized media response before buffering it',async()=>{
  const p=structuredClone(sample); p.assets.push({id:'custom',name:'custom',src:'/api/workspace/media/'+'a'.repeat(64)+'.png',category:'trees',width:1,height:1,columns:1,rows:1,fps:12});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('unused',{headers:{'Content-Type':'image/png','Content-Length':'120000000'}})));
  const storage=await import('../apps/director-web/src/workspace-storage');
  await expect(storage.portableProject(p)).rejects.toThrow('项目包');
});
