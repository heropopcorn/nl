import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { unlockWorkspace } from '../apps/director-web/workspace-service.mjs';
test('occupied port releases acquired workspace lock; explicit unlock checks dead process',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'nl-startup-'));
  const occupied=http.createServer(); await new Promise(r=>occupied.listen(0,'127.0.0.1',r));
  try {
    const child=spawn(process.execPath,['apps/director-web/server.mjs'],{env:{...process.env,NL_MODE:'local',NL_WORKSPACE:dir,PORT:String(occupied.address().port)},stdio:['ignore','ignore','pipe']});
    let error='';child.stderr.on('data',d=>error+=d);
    const code=await new Promise(r=>child.once('exit',r)); assert.notEqual(code,0); assert.match(error,/EADDRINUSE/);
    await assert.rejects(readFile(path.join(dir,'.workspace.lock')),{code:'ENOENT'});
    const dead=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});
    await writeFile(path.join(dir,'.workspace.lock'),JSON.stringify({pid:Number(dead.stdout),hostname:os.hostname()}));
    await unlockWorkspace(dir); await assert.rejects(readFile(path.join(dir,'.workspace.lock')),{code:'ENOENT'});
  } finally {await new Promise(r=>occupied.close(r));await rm(dir,{recursive:true,force:true});}
});
