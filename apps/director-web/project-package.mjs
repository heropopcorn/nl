// NL project packages are uncompressed USTAR archives: JSON + binary media.
// Streaming avoids base64 inflation and buffering large videos in Node memory.
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mediaReferences } from '../../packages/core/media-references.mjs';
const block = 512, maxFile = 512 * 1024 * 1024, maxDocument = 32 * 1024 * 1024;
const namePattern = /^media\/[a-f0-9]{64}\.(png|jpg|webp|mp3|wav|ogg|flac|m4a|glb|mp4|webm|mov|mkv)$/;
function header(name, size) {
  const b = Buffer.alloc(block);
  b.write(name,0,100); b.write('0000600\0',100); b.write('0000000\0',108); b.write('0000000\0',116);
  b.write(size.toString(8).padStart(11,'0')+'\0',124); b.write('00000000000\0',136);
  b.fill(32,148,156); b[156]=48; b.write('ustar\0',257); b.write('00',263);
  b.write([...b].reduce((n,v)=>n+v,0).toString(8).padStart(6,'0')+'\0 ',148);
  return b;
}
export async function* packageStream(project, files) {
  const json = Buffer.from(JSON.stringify(project,null,2));
  yield header('project.json',json.length); yield json;
  if(json.length%block) yield Buffer.alloc(block-json.length%block);
  for(const {name,filename,size} of files) {
    yield header(name,size);
    let count=0; const hash=createHash('sha256');
    for await(const chunk of createReadStream(filename)) {count+=chunk.length; if(count>size) throw new Error('打包时素材发生变化'); hash.update(chunk); yield chunk;}
    if(count!==size) throw new Error('打包时素材发生变化');
    if(hash.digest('hex')!==path.basename(name).split('.')[0]) throw new Error('素材内容校验失败，已停止导出项目包');
    if(size%block) yield Buffer.alloc(block-size%block);
  }
  yield Buffer.alloc(block*2);
}
export function packageSize(project, files) {
  const length=Buffer.byteLength(JSON.stringify(project,null,2));
  const size=block*3+Math.ceil(length/block)*block+files.reduce((sum,f)=>sum+block+Math.ceil(f.size/block)*block,0);
  if(length>maxDocument || files.some(f=>f.size>maxFile) || size>8*1024**3) throw new Error('项目超出项目包限制，请复制整个工作目录备份');
  return size;
}
export async function readPackage(input, staging, validate) {
  const iterator=input[Symbol.asyncIterator](); let buffer=Buffer.alloc(0), total=0;
  async function take(size, consume) {
    let remaining=size;
    while(remaining) {
      if(!buffer.length) {
        const part=await iterator.next(); if(part.done) throw new Error('项目包不完整');
        buffer=Buffer.from(part.value); total+=buffer.length;
        if(total>8*1024**3) throw new Error('项目包超过 8GB');
      }
      const chunk=buffer.subarray(0,Math.min(remaining,buffer.length)); buffer=buffer.subarray(chunk.length); remaining-=chunk.length;
      await consume(chunk);
    }
  }
  async function bytes(size) {const parts=[]; await take(size,chunk=>{parts.push(chunk);}); return Buffer.concat(parts);}
  let project; const files=[], seen=new Set();
  for(let entry=0; ; entry++) {
    // 200 scene assets + 50 drafts × (video + 120 frames + output) + JSON.
    if(entry>6301) throw new Error('项目包条目过多');
    const h=await bytes(block);
    if(h.every(v=>v===0)) {
      if(!(await bytes(block)).every(v=>v===0)) throw new Error('项目包结尾无效');
      if(buffer.some(v=>v!==0)) throw new Error('项目包包含额外数据');
      for await(const tail of { [Symbol.asyncIterator]:()=>iterator }) {total+=tail.length; if(total>8*1024**3 || tail.some(v=>v!==0)) throw new Error('项目包包含额外数据');}
      break;
    }
    const field=(start,end)=>h.subarray(start,end).toString().replace(/\0.*$/s,'').trim();
    const expected=parseInt(field(148,156),8), sum=[...h].reduce((s,v,i)=>s+(i>=148&&i<156?32:v),0);
    if(expected!==sum || field(257,263)!=='ustar' || ![0,48].includes(h[156]) || field(345,500)) throw new Error('不支持或已损坏的项目包');
    const name=field(0,100), rawSize=field(124,136), size=parseInt(rawSize,8);
    if(!/^[0-7]+$/.test(rawSize) || !Number.isSafeInteger(size) || size<0 || seen.has(name)) throw new Error('项目包条目无效');
    seen.add(name);
    if(entry===0) {
      if(name!=='project.json' || size>maxDocument) throw new Error('项目包缺少有效项目描述');
      project=validate(JSON.parse((await bytes(size)).toString()));
    } else {
      if(!namePattern.test(name) || !size || size>maxFile || !mediaReferences(project).some(a=>a.src===name)) throw new Error('项目包含非法或未引用素材');
      const filename=path.join(staging,path.basename(name)), handle=await open(filename,'wx'), hash=createHash('sha256');
      try {await take(size,async chunk=>{hash.update(chunk); await handle.writeFile(chunk);}); await handle.sync();} finally {await handle.close();}
      if(hash.digest('hex')!==path.basename(name).split('.')[0]) throw new Error('素材校验失败');
      files.push({name,filename,size});
    }
    if(size%block && !(await bytes(block-size%block)).every(v=>v===0)) throw new Error('项目包填充无效');
  }
  if(!project || mediaReferences(project).some(a=>a.src.startsWith('media/') && !seen.has(a.src))) throw new Error('项目包缺少素材');
  return {project,files};
}
