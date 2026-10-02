import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, lstat, stat, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createReviewStore } from '../../video_game/server/review-store.mjs';

export const maxReviewBytes=50*1024*1024, maxBatchBytes=200*1024*1024;
const formats={'.png':['image/png','image'],'.apng':['image/png','animation'],'.jpg':['image/jpeg','image'],'.jpeg':['image/jpeg','image'],'.webp':['image/webp','image'],'.gif':['image/gif','animation'],'.mp4':['video/mp4','video'],'.webm':['video/webm','video']};
function animatedPng(bytes) {
  for(let offset=8;offset+12<=bytes.length;) {
    const length=bytes.readUInt32BE(offset), type=bytes.subarray(offset+4,offset+8).toString();
    if(type==='acTL')return true;
    if(length>bytes.length-offset-12)break;offset+=12+length;
  }
  return false;
}
function validateFormat(bytes,ext) {
  const signature=bytes.subarray(0,12), text=signature.toString('ascii');
  const valid=ext==='.png'||ext==='.apng'?signature.subarray(0,8).toString('hex')==='89504e470d0a1a0a'
    : ext==='.jpg'||ext==='.jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    : ext==='.gif'?/^GIF8[79]a/.test(text)
    : ext==='.webp'?text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'
    : ext==='.webm'?signature.subarray(0,4).toString('hex')==='1a45dfa3'
    : text.slice(4,8)==='ftyp';
  if(!valid)throw new Error('文件内容与扩展名不匹配，或尚未生成完整');
}
export async function scanReviewInbox(repo) {
  const root=path.resolve(repo,'resource-review/inbox'), files=[], byId=new Map();
  try {if(await realpath(root)!==root)throw new Error('待确认目录不可使用符号链接');}
  catch(e){if(e.code==='ENOENT')return [];throw e;}
  async function walk(dir) {
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(entry.name.startsWith('.'))continue;
      const filename=path.join(dir,entry.name), relative=path.relative(root,filename).split(path.sep).join('/');
      if(entry.isSymbolicLink())throw new Error(`待确认目录不允许符号链接：${relative}`);
      if(entry.isDirectory()){await walk(filename);continue;}
      const ext=path.extname(entry.name).toLowerCase();if(!formats[ext])continue;
      if(!entry.isFile() || await realpath(filename)!==filename)throw new Error(`无效素材路径：${relative}`);
      const info=await stat(filename);if(!info.size || info.size>maxReviewBytes)throw new Error(`待确认素材必须为 1 字节至 50MB：${relative}`);
      if(entry.name.length>255)throw new Error('素材文件名过长');
      const bytes=await readFile(filename);if(bytes.length!==info.size)throw new Error(`素材正在变化，请生成完毕后重试：${relative}`);
      try{validateFormat(bytes,ext);}catch(e){throw new Error(`${relative}：${e.message}`);}
      const id=createHash('sha256').update(bytes).digest('hex');
      if(byId.has(id)){byId.get(id).paths.push('resource-review/inbox/'+relative);continue;}
      let [mime,kind]=formats[ext];
      if(mime==='image/png' && animatedPng(bytes) || mime==='image/webp' && bytes.subarray(12,16).toString()==='VP8X' && (bytes[20]&2))kind='animation';
      const asset={id,name:entry.name,kind,mime,bytes:bytes.length,extension:ext,paths:['resource-review/inbox/'+relative]};
      byId.set(id,asset);files.push(asset);
      if(files.length>2000)throw new Error('待确认目录超过 2000 个不同素材，请先归档已处理文件');
    }
  }
  await walk(root);return files;
}
export async function prepareReview({repo,publicDir,env=process.env,store}) {
  // publicDir is selected by buildPaths, never a user-uploaded path.
  const output=path.resolve(publicDir,'resource-review');
  if(!path.resolve(publicDir).startsWith(path.resolve(repo,'apps/director-web/.generated')+path.sep))throw new Error('确认输出必须位于专用构建目录');
  await mkdir(publicDir,{recursive:true});
  if(await realpath(publicDir)!==path.resolve(publicDir))throw new Error('构建目录不可为符号链接');
  try{if((await lstat(output)).isSymbolicLink())throw new Error('确认输出不可为符号链接');}catch(e){if(e.code!=='ENOENT')throw e;}
  // Remove the *generated* review batch, never the inbox or originals.
  await rm(output,{recursive:true,force:true});await mkdir(path.join(output,'media'),{recursive:true});
  let manifest={version:1,enabled:false,namespace:null,generatedAt:new Date().toISOString(),items:[]};
  if(env.NL_REVIEW_ENABLED==='1') {
    store ??= createReviewStore(env);
    const assets=await scanReviewInbox(repo);await store.register(assets);
    const states=new Map();
    for(let i=0;i<assets.length;i+=100)for(const row of await store.list({ids:assets.slice(i,i+100).map(a=>a.id)}))states.set(row.asset_id,row.status);
    if(assets.some(a=>!states.has(a.id)))throw new Error('云端确认状态不完整，停止发布，避免把已确认资源当作新资源');
    const pending=assets.filter(a=>states.get(a.id)==='pending');
    if(pending.length>500 || pending.reduce((sum,a)=>sum+a.bytes,0)>maxBatchBytes)throw new Error('本次未确认素材超过 500 项或 200MB，请分批放入待确认目录');
    const items=[];
    for(const asset of pending) {
      const source=path.resolve(repo,asset.paths[0]);
      if(await realpath(source)!==source)throw new Error('复制前发现素材路径变化');
      const bytes=await readFile(source);
      if(createHash('sha256').update(bytes).digest('hex')!==asset.id)throw new Error('素材在构建期间发生变化，请重新发布');
      const name=asset.id+asset.extension;
      await writeFile(path.join(output,'media',name),bytes,{flag:'wx'});
      const {paths,extension,...item}=asset;items.push({...item,url:'/resource-review/media/'+name});
    }
    const scan={
      source:'resource-review/inbox/',
      files:assets.reduce((sum,asset)=>sum+asset.paths.length,0),
      uniqueAssets:assets.length,
      images:assets.filter(asset=>asset.kind==='image').length,
      animations:assets.filter(asset=>asset.kind==='animation').length,
      videos:assets.filter(asset=>asset.kind==='video').length,
      pending:pending.length,
      reviewed:assets.length-pending.length,
    };
    manifest={...manifest,enabled:true,namespace:store.namespace,items,scan};
    if(!scan.uniqueAssets)console.log('资源确认：resource-review/inbox/ 中没有可发布的图片、动图或视频；其他目录的素材不会自动加入待确认批次');
    else if(!scan.pending)console.log(`资源确认：本次扫描 ${scan.files} 个文件、${scan.uniqueAssets} 项不同素材，已全部标记；不发布素材，原件保留`);
    else console.log(`资源确认：扫描 ${scan.files} 个文件、${scan.uniqueAssets} 项不同素材；发布 ${scan.pending} 项未确认素材，排除 ${scan.reviewed} 项已确认素材`);
  }
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  return manifest;
}
