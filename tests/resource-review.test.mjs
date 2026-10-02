import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink } from 'node:fs/promises';
import { createHash,createHmac } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { scanReviewInbox,prepareReview } from '../tools/resource-review/library.mjs';
import { syncReview,fetchReviewDecisions } from '../tools/resource-review/sync.mjs';
import { createReviewHandler } from '../video_game/server/resource-review.mjs';
import { createReviewStore,reviewConfig } from '../video_game/server/review-store.mjs';
import { isReviewBotRead } from '../video_game/server/review-access.mjs';

const png=Buffer.from('89504e470d0a1a0a0000000049454e4400000000','hex');
const secret='review-test-cookie-secret-with-32-characters';
const env={NL_REVIEW_ENABLED:'1',NL_REVIEW_NAMESPACE:'nl-test',AUTH_SECRET:secret,NL_REVIEW_BOT_TOKEN:'review-test-read-only-token-32-characters'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function memoryStore() {
  const rows=new Map();
  return {namespace:'nl-test',rows,async register(assets){for(const a of assets)if(!rows.has(a.id))rows.set(a.id,{...a,asset_id:a.id,status:'pending',note:'',revision:0,updated_at:new Date().toISOString()});},
    async list({ids,after}={}){return [...rows.values()].filter(r=>(!ids||ids.includes(r.asset_id))&&(!after||r.asset_id>after)).sort((a,b)=>a.asset_id.localeCompare(b.asset_id)).slice(0,500);},
    async decide(input){const row=rows.get(input.id);if(!row || row.revision!==input.revision)throw Object.assign(new Error('conflict'),{status:409});Object.assign(row,{status:input.status,note:input.note,revision:row.revision+1});return {...row};}};
}
test('publish only pending content, never reset approvals, and changed bytes become a new identity',async()=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'nl-review-build-')),publicDir=path.join(repo,'apps/director-web/.generated/preview-demo');
  const inbox=path.join(repo,'resource-review/inbox');await mkdir(inbox,{recursive:true});
  const store=memoryStore();
  try {
    await writeFile(path.join(inbox,'same-name.png'),png);await writeFile(path.join(inbox,'duplicate.png'),png);
    await writeFile(path.join(inbox,'clip.webm'),Buffer.from('1a45dfa3aabbcc','hex'));
    await writeFile(path.join(inbox,'loop.gif'),Buffer.from('GIF89a123456'));
    const scanned=await scanReviewInbox(repo);assert.equal(scanned.length,3);assert.equal(scanned.find(a=>a.mime==='image/png').paths.length,2);
    const first=await prepareReview({repo,publicDir,env,store});assert.equal(first.items.length,3);assert.equal(first.namespace,'nl-test');
    assert.deepEqual(first.scan,{source:'resource-review/inbox/',files:4,uniqueAssets:3,images:1,animations:1,videos:1,pending:3,reviewed:0});
    assert.ok(!JSON.stringify(first.items).includes('inbox/'));assert.ok(!JSON.stringify(first).includes(repo));assert.ok(!JSON.stringify(first).includes('secret'));
    for(const item of first.items)assert.ok((await readFile(path.join(publicDir,item.url))).length);
    const id=createHash('sha256').update(png).digest('hex');store.rows.get(id).status='usable';
    const rejected=first.items.find(a=>a.kind==='video');store.rows.get(rejected.id).status='unusable';
    const second=await prepareReview({repo,publicDir,env,store});assert.equal(second.items.length,1);assert.equal(second.items[0].kind,'animation');
    assert.deepEqual(second.scan,{...first.scan,pending:1,reviewed:2});
    assert.equal((await readdir(path.join(publicDir,'resource-review/media'))).length,1);
    assert.equal(store.rows.get(id).status,'usable');
    await writeFile(path.join(inbox,'same-name.png'),Buffer.concat([png,Buffer.from('new content')]));
    const third=await prepareReview({repo,publicDir,env,store});assert.equal(third.items.length,2);assert.ok(third.items.some(a=>a.name==='same-name.png'&&a.id!==id));
    assert.deepEqual(third.scan,{...first.scan,uniqueAssets:4,images:2,pending:2,reviewed:2});
    const original=await readFile(path.join(inbox,'duplicate.png'));assert.deepEqual(original,png);
    await assert.rejects(prepareReview({repo,publicDir,env,store:{...store,list:async()=>[]}}),/状态不完整/);
    await assert.rejects(readFile(path.join(publicDir,'resource-review/manifest.json')));
    const disabled=await prepareReview({repo,publicDir,env:{},store:{register:()=>{throw Error('must not contact cloud');}}});assert.equal(disabled.enabled,false);
    assert.equal(Object.hasOwn(disabled,'scan'),false);
    assert.deepEqual(await readdir(path.join(publicDir,'resource-review/media')),[]);
    await symlink(path.join(inbox,'duplicate.png'),path.join(inbox,'linked.png'));
    await assert.rejects(scanReviewInbox(repo),/符号链接/);
  } finally {await rm(repo,{recursive:true,force:true});}
});
test('scan diagnostics distinguish an empty inbox from an entirely reviewed batch and ignore other media directories',async()=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'nl-review-diagnostics-')),publicDir=path.join(repo,'apps/director-web/.generated/preview-demo');
  const inbox=path.join(repo,'resource-review/inbox'),store=memoryStore();
  try {
    await mkdir(path.join(repo,'assets'),{recursive:true});await writeFile(path.join(repo,'assets','outside.png'),png);
    const empty=await prepareReview({repo,publicDir,env,store});
    assert.deepEqual(empty.scan,{source:'resource-review/inbox/',files:0,uniqueAssets:0,images:0,animations:0,videos:0,pending:0,reviewed:0});
    assert.equal(empty.enabled,true);assert.deepEqual(empty.items,[]);assert.equal(store.rows.size,0);
    await mkdir(path.join(inbox,'nested'),{recursive:true});
    await writeFile(path.join(inbox,'.gitkeep'),'');await writeFile(path.join(inbox,'README.txt'),'not a supported media file');
    await writeFile(path.join(inbox,'nested','inside.png'),png);await writeFile(path.join(inbox,'copy.png'),png);
    await store.register(await scanReviewInbox(repo));for(const row of store.rows.values())row.status='usable';
    const reviewed=await prepareReview({repo,publicDir,env,store});
    assert.deepEqual(reviewed.scan,{...empty.scan,files:2,uniqueAssets:1,images:1,reviewed:1});
    assert.deepEqual(reviewed.items,[]);assert.deepEqual(await readdir(path.join(publicDir,'resource-review/media')),[]);
    assert.deepEqual(JSON.parse(await readFile(path.join(publicDir,'resource-review/manifest.json'),'utf8')),reviewed);
    assert.ok(!JSON.stringify(reviewed).includes('outside.png'));assert.ok(!JSON.stringify(reviewed).includes('inside.png'));assert.ok(!JSON.stringify(reviewed).includes(repo));
    assert.deepEqual(await readFile(path.join(inbox,'nested','inside.png')),png);assert.deepEqual(await readFile(path.join(repo,'assets','outside.png')),png);
  } finally {await rm(repo,{recursive:true,force:true});}
});
test('disabled review does not scan the inbox or expose scan diagnostics',async()=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'nl-review-disabled-')),publicDir=path.join(repo,'apps/director-web/.generated/preview-demo');
  const inbox=path.join(repo,'resource-review/inbox');
  try {
    await mkdir(inbox,{recursive:true});await writeFile(path.join(inbox,'broken.png'),'not a valid image');
    await assert.rejects(scanReviewInbox(repo),/文件内容与扩展名不匹配/);
    const store={register(){throw new Error('must not register');},list(){throw new Error('must not query');}};
    const disabled=await prepareReview({repo,publicDir,env:{},store});
    assert.equal(disabled.enabled,false);assert.equal(Object.hasOwn(disabled,'scan'),false);assert.deepEqual(disabled.items,[]);
    assert.deepEqual(JSON.parse(await readFile(path.join(publicDir,'resource-review/manifest.json'),'utf8')),disabled);
    assert.equal(await readFile(path.join(inbox,'broken.png'),'utf8'),'not a valid image');
  } finally {await rm(repo,{recursive:true,force:true});}
});
test('review API enforces cookie auth, read-only bot token, same-origin writes, namespaces and revision conflicts',async()=>{
  const store=memoryStore(),id='a'.repeat(64);await store.register([{id,name:'test.png'}]);
  const handle=createReviewHandler(env,()=>store),origin='https://nl.test';
  const expiry=String(Date.now()+3600000),cookie='director_session='+expiry+'.'+createHmac('sha256',secret).update(expiry).digest('base64url');
  const get=headers=>new Request(origin+'/api/resource-review',{headers});
  assert.equal((await handle(get({}))).status,401);
  assert.equal((await handle(get({Authorization:'Bearer bad'}))).status,401);
  assert.equal((await handle(get({Authorization:'Bearer '+env.NL_REVIEW_BOT_TOKEN}))).status,200);
  const post=(body,headers={})=>new Request(origin+'/api/resource-review',{method:'POST',headers:{cookie,Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const change={namespace:'nl-test',id,status:'usable',note:'保留',revision:0};
  assert.equal((await handle(post(change,{cookie:'',Authorization:'Bearer '+env.NL_REVIEW_BOT_TOKEN}))).status,401);
  assert.equal((await handle(post(change,{Origin:'https://evil.test'}))).status,403);
  assert.equal((await handle(post({...change,namespace:'other'}))).status,409);
  assert.equal((await handle(post({...change,id:'../bad'}))).status,400);
  assert.equal((await handle(post({...change,note:'x'.repeat(2001)}))).status,400);
  const saved=await handle(post(change));assert.equal(saved.status,200);assert.equal((await saved.json()).row.status,'usable');
  assert.equal((await handle(post(change))).status,409);
  assert.equal((await handle(post({...change,revision:1,status:'pending'}))).status,200);
  assert.equal((await handle(new Request(origin+'/api/resource-review',{method:'DELETE',headers:{cookie}}))).status,405);
  assert.equal(isReviewBotRead(new Request(origin+'/api/workspace',{headers:{Authorization:'Bearer '+env.NL_REVIEW_BOT_TOKEN}}),env),false);
  assert.equal(isReviewBotRead(new Request(origin+'/resource-review/media/a.png',{headers:{Authorization:'Bearer '+env.NL_REVIEW_BOT_TOKEN}}),env),false);
  const unavailable=createReviewHandler(env,()=>{throw Object.assign(new Error('paused'),{status:503});});
  assert.equal((await unavailable(get({cookie}))).status,503);
});
test('server-only Supabase adapter uses safe headers, preserves decisions, and hides upstream errors',async()=>{
  const config={...env,NL_REVIEW_SUPABASE_URL:'https://example.supabase.co',NL_REVIEW_SUPABASE_SECRET_KEY:'sb_secret_test-only'};
  assert.throws(()=>reviewConfig({...config,VERCEL_ENV:'preview'}),/preview/);
  assert.throws(()=>reviewConfig({...config,NL_REVIEW_SUPABASE_SECRET_KEY:'public-key'}),/密钥/);
  let called=false;
  const store=createReviewStore(config,async(url,options)=>{
    assert.ok(url.startsWith('https://example.supabase.co/rest/v1/'));assert.equal(options.headers.apikey,'sb_secret_test-only');assert.equal(options.headers.Authorization,undefined);
    if(options.method==='POST'){assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');assert.ok(!options.body.includes('status'));called=true;return new Response(null,{status:201});}
    return json({message:'sensitive upstream details',code:'XX000'},500);
  });
  await store.register([{id:'a'.repeat(64),name:'x',kind:'image',mime:'image/png',bytes:10}]);assert.equal(called,true);
  await assert.rejects(store.list({ids:['a'.repeat(64)]}),e=>e.status===503&&!e.message.includes('sensitive'));
});
test('bot sync matches current local hashes, preserves notes, never moves media, and refuses wrong namespace',async()=>{
  const repo=await mkdtemp(path.join(os.tmpdir(),'nl-review-sync-')),inbox=path.join(repo,'resource-review/inbox');await mkdir(inbox,{recursive:true});
  try {
    await writeFile(path.join(inbox,'keep.png'),png);await writeFile(path.join(inbox,'new.png'),Buffer.concat([png,Buffer.from('new')]));
    const id=createHash('sha256').update(png).digest('hex');
    const rows=[{asset_id:id,status:'unusable',note:'边缘不完整',revision:2,updated_at:'2026-09-29'}];
    const report=await syncReview({repo,env:{...env,NL_REVIEW_SITE_URL:'https://nl.test'},request:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer '+env.NL_REVIEW_BOT_TOKEN);return json({namespace:env.NL_REVIEW_NAMESPACE,rows,next:null});}});
    assert.equal(report.unusable.length,1);assert.equal(report.unusable[0].note,'边缘不完整');assert.equal(report.pending.length,1);assert.equal(report.pending[0].registered,false);
    assert.deepEqual(await readFile(path.join(inbox,'keep.png')),png);
    assert.deepEqual(JSON.parse(await readFile(path.join(repo,'resource-review/decisions.json'),'utf8')),report);
    await assert.rejects(fetchReviewDecisions('https://nl.test',env.NL_REVIEW_BOT_TOKEN,'nl-test',async()=>json({namespace:'wrong',rows,next:null})),/不匹配/);
    await assert.rejects(fetchReviewDecisions('http://nl.test',env.NL_REVIEW_BOT_TOKEN,'nl-test'),/HTTPS/);
  } finally {await rm(repo,{recursive:true,force:true});}
});
