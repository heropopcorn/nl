import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWorkspaceService } from '../apps/director-web/workspace-service.mjs';
import { projectSchema, sample } from '../apps/director-web/.local-runtime/core.mjs';
import { packageStream } from '../apps/director-web/project-package.mjs';

test('video production drafts survive disk restart and package transfer; cleanup protects all references',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'nl-sprite-origin-'));
  const other=await mkdtemp(path.join(os.tmpdir(),'nl-sprite-destination-'));
  let service=await createWorkspaceService(dir,projectSchema.parse);
  const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  let token=(await (await fetch(base+'/api/workspace')).json()).token;
  const call=(route,method='GET',value,extra={})=>fetch(base+'/api/workspace'+route,{method,headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'application/json',...extra},...(value===undefined?{}:{body:Buffer.isBuffer(value)?value:JSON.stringify(value)})});
  try {
    const upload=async(content,type)=>(await (await call('/media','POST',Buffer.from(content),{'Content-Type':type})).json()).src;
    const video=await upload('source video','video/quicktime'),frame=await upload('processed frame','image/png'),output=await upload('sheet output','image/png');
    const p=structuredClone(sample);
    p.spriteDrafts=[{id:'a6c7df0e-e8d8-46af-b4b5-9bfbd56d4bc2',version:1,name:'小视频',categoryId:'',updatedAt:1,source:{src:video,name:'walk.mov',type:'video/quicktime'},
      frames:[{id:'f1',index:0,time:0.25,enabled:true,width:32,height:32,cutout:true,src:frame}],
      extract:{mode:'fps',fps:4,interval:0.1,maxFrames:48,maxDimension:512},pack:{columns:0,padding:2,spacing:0,cellWidth:0,cellHeight:0,pivot:'bottom'},threshold:38,crop:true,fps:12,output:{src:output}}];
    const saved=await call('/project','PUT',{project:p,revision:'new'});assert.equal(saved.status,200);
    let revision=(await saved.json()).revision;
    const disk=JSON.parse(await readFile(path.join(dir,'project.json'),'utf8'));
    assert.match(disk.spriteDrafts[0].source.src,/^media\/.*\.mov$/);
    assert.ok(!JSON.stringify(disk).includes('/api/'));assert.ok(!JSON.stringify(disk).includes('blob:'));
    for(const src of [video,frame,output]) {const old=new Date(Date.now()-48*3600*1000);await utimes(path.join(dir,'media',path.basename(src)),old,old);}
    const plan=await (await call('/maintenance/plan','POST',{keep:1})).json();assert.deepEqual(plan.candidates,[]);
    const exported=await call('/package/export','POST',{project:p});assert.equal(exported.status,200);
    const packed=Buffer.from(await exported.arrayBuffer());
    // Removing a record retains a real recovery checkpoint and its media.
    assert.equal((await call('/project','PUT',{project:{...p,spriteDrafts:[]},revision,checkpoint:true})).status,200);
    assert.deepEqual((await (await call('/maintenance/plan','POST',{keep:1})).json()).candidates,[]);
    await service.close();service=await createWorkspaceService(other,projectSchema.parse);
    token=(await (await call('')).json()).token;
    const imported=await call('/package/import','POST',packed,{'X-Workspace-Revision':'new'});assert.equal(imported.status,200);
    const result=await imported.json();revision=result.revision;
    assert.deepEqual(result.project.spriteDrafts,p.spriteDrafts);
    assert.equal(await (await fetch(base+video)).text(),'source video');
    assert.equal(await (await fetch(base+frame)).text(),'processed frame');
    assert.equal(await (await fetch(base+output)).text(),'sheet output');
    await service.close();service=await createWorkspaceService(other,projectSchema.parse);
    token=(await (await call('')).json()).token;
    assert.deepEqual((await (await call('/project')).json()).project.spriteDrafts,p.spriteDrafts);
    const bad=structuredClone(p);bad.spriteDrafts[0].frames[0].src='/api/workspace/media/'+'f'.repeat(64)+'.png';
    assert.equal((await call('/project','PUT',{project:bad,revision})).status,400);
    const missing=[];for await(const chunk of packageStream(disk,[]))missing.push(chunk);
    assert.equal((await call('/package/import','POST',Buffer.concat(missing),{'X-Workspace-Revision':revision})).status,400);
    assert.deepEqual((await (await call('/project')).json()).project.spriteDrafts,p.spriteDrafts);
    assert.equal((await call('/project','PUT',{project:p,revision:'stale'})).status,409);
  } finally {await new Promise(r=>server.close(r));await service.close();await rm(dir,{recursive:true,force:true});await rm(other,{recursive:true,force:true});}
});
