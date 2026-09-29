import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
const prepare = profile => {
  const run=spawnSync(process.execPath,['apps/director-web/scripts/prepare-assets.mjs'],{env:{...process.env,NL_MODE:'preview',NL_ASSET_PROFILE:profile},encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
};
test('full to demo rebuild physically excludes assets and publishes matching manifests', async()=>{
  prepare('full'); const full=JSON.parse(await readFile('apps/director-web/.generated/preview-full/runtime.json','utf8'));
  prepare('demo'); const demo=JSON.parse(await readFile('apps/director-web/.generated/preview-demo/runtime.json','utf8'));
  assert.ok(full.available.length>demo.available.length);
  assert.ok(!demo.available.includes('/art/nl_ground_desert_dunes.png'));
  await assert.rejects(stat('apps/director-web/.generated/preview-demo/art/nl_ground_desert_dunes.png'));
  const files=await readdir('apps/director-web/.generated/preview-demo/art'); assert.equal(files.length,demo.available.length);
  const manifest=JSON.parse(await readFile('apps/director-web/.generated/preview-demo/assets.json','utf8'));
  for(const variants of Object.values(manifest)) for(const asset of Object.values(variants)) assert.ok(demo.available.includes(asset.url));
  assert.deepEqual(JSON.parse(await readFile('apps/director-web/.generated/preview-full/runtime.json','utf8')),full);
  const local=spawnSync(process.execPath,['apps/director-web/scripts/prepare-assets.mjs'],{env:{...process.env,NL_MODE:'local',NL_ASSET_PROFILE:'full'},encoding:'utf8'}); assert.equal(local.status,0,local.stderr);
  const localConfig=await readFile('apps/director-web/.generated/local-full/runtime.json','utf8'); prepare('demo');
  assert.equal(await readFile('apps/director-web/.generated/local-full/runtime.json','utf8'),localConfig);
});
