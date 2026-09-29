import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWorkspaceService } from '../apps/director-web/workspace-service.mjs';
import { projectSchema, sample } from '../apps/director-web/.local-runtime/core.mjs';

test('disk workspaces persist isolated media, backups, revisions and block unsafe writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'yuanli-workspace-test-'));
  let service = await createWorkspaceService(dir, projectSchema.parse);
  const server = http.createServer((req,res)=>service.handler(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let token=(await (await fetch(base+'/api/workspace')).json()).token;
  const call=(route, method='GET', body, headers={})=>fetch(base+'/api/workspace'+route,{method,headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  try {
    await assert.rejects(createWorkspaceService(dir,projectSchema.parse),/占用/);
    assert.equal((await call('/project','PUT',{},{'X-Workspace-Token':''})).status,403);
    assert.equal((await call('/project','PUT',{},{Origin:'http://other.test'})).status,403);
    const fresh=await (await call('/project')).json(); assert.equal(fresh.revision,'new'); assert.equal(fresh.project,null);
    const upload=await fetch(base+'/api/workspace/media',{method:'POST',headers:{Origin:base,'X-Workspace-Token':token,'Content-Type':'image/png'},body:Buffer.from('test-image')});
    assert.equal(upload.status,201); const {src}=await upload.json();
    const p=structuredClone(sample); p.assets.push({id:'uploaded',name:'测试图',category:'houses',src,width:1,height:1,columns:1,rows:1,fps:12});
    let saved=await call('/project','PUT',{project:p,revision:'new'}); assert.equal(saved.status,200); const first=await saved.json();
    const disk=JSON.parse(await readFile(path.join(dir,'project.json'),'utf8')); assert.match(disk.assets[0].src,/^media\//); assert.ok(!JSON.stringify(disk).includes('data:'));
    assert.equal((await (await call('/project')).json()).project.assets[0].src,src);
    p.name='修改'; saved=await call('/project','PUT',{project:p,revision:first.revision,checkpoint:true}); assert.equal(saved.status,200); const second=await saved.json();
    assert.equal((await call('/project','PUT',{project:p,revision:first.revision})).status,409);
    assert.equal((await call('/project','PUT',{project:{version:1},revision:second.revision})).status,400);
    const backups=await (await call('/backups')).json(); assert.equal(backups.length,1); assert.equal(backups[0].project.name,sample.name);
    assert.equal(await (await fetch(base+src)).text(),'test-image');
    const range=await fetch(base+src,{headers:{Range:'bytes=0-3'}}); assert.equal(range.status,206); assert.equal(await range.text(),'test');
    const invalid=structuredClone(p); invalid.assets[0].src='/api/workspace/media/'+'a'.repeat(64)+'.png';
    assert.equal((await call('/project','PUT',{project:invalid,revision:second.revision})).status,400);
    await symlink(path.join(dir,'project.json'),path.join(dir,'media','b'.repeat(64)+'.png'));
    assert.equal((await call('/media/'+'b'.repeat(64)+'.png')).status,403);
    await service.close(); service=await createWorkspaceService(dir,projectSchema.parse);
    token=(await (await call('')).json()).token;
    assert.equal((await (await call('/project')).json()).project.name,'修改');
    await writeFile(path.join(dir,'project.json'),'damaged');
    assert.equal((await call('/project')).status,422);
    assert.equal((await call('/project','PUT',{project:p,revision:second.revision})).status,422);
    assert.equal(await readFile(path.join(dir,'project.json'),'utf8'),'damaged');
    assert.ok((await readdir(path.join(dir,'backups'))).length);
  } finally { await new Promise(resolve=>server.close(resolve)); await service.close(); await rm(dir,{recursive:true,force:true}); }
});
