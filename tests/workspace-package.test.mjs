import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, readdir, rm, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createWorkspaceService, unlockWorkspace } from '../apps/director-web/workspace-service.mjs';
import { projectSchema, sample } from '../apps/director-web/.local-runtime/core.mjs';
import { packageStream, packageSize } from '../apps/director-web/project-package.mjs';

test('project packages roundtrip binary media; malformed imports preserve current project',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'nl-package-'));
  const service=await createWorkspaceService(dir,projectSchema.parse);
  const server=http.createServer((req,res)=>service.handler(req,res)); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const {token}=await (await fetch(base+'/api/workspace')).json();
  const call=(route,body,extra={})=>fetch(base+'/api/workspace'+route,{method:'POST',headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'application/json',...extra},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  const put=async(p,revision)=>fetch(base+'/api/workspace/project',{method:'PUT',headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'application/json'},body:JSON.stringify({project:p,revision})});
  try {
    const uploaded=await call('/media',Buffer.from('binary media'),{'Content-Type':'image/png'}), {src}=await uploaded.json();
    const p=structuredClone(sample);p.assets.push({id:'custom',name:'custom',category:'trees',src,width:1,height:1,columns:1,rows:1,fps:12});
    let saved=await (await put(p,'new')).json();
    const response=await call('/package/export',{project:p}); assert.equal(response.status,200);
    const packed=Buffer.from(await response.arrayBuffer()); assert.equal(packed.length,Number(response.headers.get('content-length')));
    const original=await readFile(path.join(dir,'project.json'),'utf8');
    for(const bad of [packed.subarray(0,packed.length-1024),Buffer.from('not a package')]) {
      assert.equal((await call('/package/import',bad,{'X-Workspace-Revision':saved.revision})).status,400);
      assert.equal(await readFile(path.join(dir,'project.json'),'utf8'),original);
    }
    const corrupted=Buffer.from(packed);corrupted[corrupted.indexOf('binary media')]=0;
    assert.equal((await call('/package/import',corrupted,{'X-Workspace-Revision':saved.revision})).status,400);
    const malformed={...p,assets:[{...p.assets[0],src:'media/../../bad.png'}]};
    const chunks=[];for await(const part of packageStream(malformed,[]))chunks.push(part);
    assert.equal((await call('/package/import',Buffer.concat(chunks),{'X-Workspace-Revision':saved.revision})).status,400);
    p.name='a different project';saved=await (await put(p,saved.revision)).json();
    assert.equal((await call('/package/import',packed,{'X-Workspace-Revision':'old'})).status,409);
    const imported=await call('/package/import',packed,{'X-Workspace-Revision':saved.revision});assert.equal(imported.status,200);
    assert.equal((await imported.json()).project.name,sample.name);
    assert.equal(await readFile(path.join(dir,'media',path.basename(src)),'utf8'),'binary media');
    assert.ok((await readdir(path.join(dir,'backups'))).length>0);
    assert.equal((await readdir(dir)).some(n=>n.startsWith('.import-')),false);
    assert.throws(()=>packageSize(p,[{size:513*1024*1024}]),/限制/);
  } finally {await new Promise(r=>server.close(r));await service.close();await rm(dir,{recursive:true,force:true});}
});

test('cleanup protects retained references and recent imports, requires matching plan, and is recoverable',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'nl-cleanup-'));
  const service=await createWorkspaceService(dir,projectSchema.parse);
  const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`, {token}=await (await fetch(base+'/api/workspace')).json();
  const call=(route,body)=>fetch(base+'/api/workspace'+route,{method:'POST',headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    const old=new Date(Date.now()-48*3600*1000);
    const make=async(content,aged)=>{const name=createHash('sha256').update(content).digest('hex')+'.png';await writeFile(path.join(dir,'media',name),content);if(aged) await utimes(path.join(dir,'media',name),old,old);return name;};
    const live=await make('live',true), historical=await make('history',true), unused=await make('unused',true), recent=await make('recent',false);
    const asset=name=>({id:name,name,category:'trees',src:'media/'+name,width:1,height:1,columns:1,rows:1,fps:12});
    const p=structuredClone(sample);p.assets=[asset(live)];await writeFile(path.join(dir,'project.json'),JSON.stringify(p));
    p.assets=[asset(historical)];await writeFile(path.join(dir,'backups','200-abcdef.json'),JSON.stringify(p));await writeFile(path.join(dir,'backups','100-abcdef.json'),JSON.stringify(p));
    const plan=await (await call('/maintenance/plan',{keep:1})).json();
    assert.deepEqual(plan.candidates.sort(),['backups/100-abcdef.json','media/'+unused].sort());
    assert.equal((await call('/maintenance/clean',{keep:1,signature:'bad'})).status,409);
    const result=await (await call('/maintenance/clean',{keep:1,signature:plan.signature})).json();assert.equal(result.moved,2);
    assert.ok((await readdir(path.join(dir,'media'))).includes(recent));
    assert.equal((await call('/maintenance/restore',{id:result.id})).status,200);
    assert.ok((await readdir(path.join(dir,'media'))).includes(unused));
    const again=await (await call('/maintenance/plan',{keep:1})).json();
    const batch=await (await call('/maintenance/clean',{keep:1,signature:again.signature})).json();
    assert.equal((await call('/maintenance/purge',{id:batch.id})).status,400);
    assert.equal((await call('/maintenance/purge',{id:batch.id,confirm:'永久删除'})).status,200);
    await writeFile(path.join(dir,'backups','300-abcdef.json'),'broken');
    assert.equal((await call('/maintenance/plan',{keep:1})).status,400);
    assert.ok((await readdir(path.join(dir,'media'))).includes(live));assert.ok((await readdir(path.join(dir,'media'))).includes(historical));
    await assert.rejects(unlockWorkspace(dir),/仍在运行/);
  } finally {await new Promise(r=>server.close(r));await service.close();await rm(dir,{recursive:true,force:true});}
});
