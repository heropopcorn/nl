import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { resolveWorkspace } from '../apps/director-web/workspace-location.mjs';
import { createWorkspaceService } from '../apps/director-web/workspace-service.mjs';
import { projectSchema, sample } from '../apps/director-web/.local-runtime/core.mjs';

test('default is inside repository; source roots and symlink escapes are rejected; legacy data is not silently abandoned',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'nl-location-')), repo=path.join(temp,'repo'), old=path.join(temp,'legacy');
  await mkdir(repo);await mkdir(old);
  const resolve=argument=>resolveWorkspace({repo,argument,legacyDirectory:old});
  try {
    assert.equal(await resolve(),path.join(repo,'projects','default'));
    assert.equal(await resolve('projects/我的作品'),path.join(repo,'projects','我的作品'));
    assert.equal(await resolve(old),old);
    for(const bad of ['.','projects','apps/editor','projects/../assets','projects/../../repo/.git']) await assert.rejects(resolve(bad),/projects/);
    await mkdir(path.join(repo,'projects'));
    await symlink(old,path.join(repo,'projects','escape'));
    await assert.rejects(resolve('projects/escape'),/符号链接/);
    await symlink(repo,path.join(temp,'alias'));
    await assert.rejects(resolve(path.join(temp,'alias','apps')),/projects/);
    await writeFile(path.join(old,'project.json'),'legacy original');
    await assert.rejects(resolve(),/发现旧版作品/);
    assert.equal(await resolve('projects/default'),path.join(repo,'projects','default'));
    assert.equal(await readFile(path.join(old,'project.json'),'utf8'),'legacy original');
    await mkdir(path.join(repo,'projects','default'));await writeFile(path.join(repo,'projects','default','project.json'),'existing work');
    assert.equal(await resolve(),path.join(repo,'projects','default'));
  } finally {await rm(temp,{recursive:true,force:true});}
});

test('repository workspaces persist project and media together with portable relative references',async()=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'nl-in-repo-'));
  const directory=await resolveWorkspace({repo,legacyDirectory:path.join(repo,'absent')});
  const service=await createWorkspaceService(directory,projectSchema.parse);
  const server=http.createServer((req,res)=>service.handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`, {token}=await (await fetch(base+'/api/workspace')).json();
  const headers={Origin:base,'X-Workspace-Token':token};
  try {
    const upload=await fetch(base+'/api/workspace/media',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:'local image'});
    const {src}=await upload.json(), p=structuredClone(sample);
    p.assets.push({id:'custom',name:'test',category:'trees',src,width:1,height:1,columns:1,rows:1,fps:12});
    const save=await fetch(base+'/api/workspace/project',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({project:p,revision:'new'})});assert.equal(save.status,200);
    const stored=JSON.parse(await readFile(path.join(repo,'projects/default/project.json'),'utf8'));
    assert.match(stored.assets[0].src,/^media\//);assert.ok(!JSON.stringify(stored).includes(repo));
    assert.equal(await readFile(path.join(directory,stored.assets[0].src),'utf8'),'local image');
  } finally {await new Promise(r=>server.close(r));await service.close();await rm(repo,{recursive:true,force:true});}
});

test('Git tracks project documents/media but ignores machine-local state',()=>{
  const run=file=>spawnSync('git',['check-ignore','--no-index',file],{encoding:'utf8'});
  for(const name of ['project.json','media/a.png','media/a.mp4','media/.gitkeep']) assert.equal(run('projects/default/'+name).status,1,name);
  for(const name of ['.workspace.lock','backups/1.json','exports/1.mp4','.trash/batch/a.png','.import-abcd/file.png','project.json.abc.tmp','media/abc.tmp']) assert.equal(run('projects/default/'+name).status,0,name);
});
