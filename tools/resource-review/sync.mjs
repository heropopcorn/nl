import { mkdir, open, rename, unlink, realpath } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { scanReviewInbox } from './library.mjs';
import { reviewId, reviewNamespace, reviewStatuses } from '../../video_game/server/review-store.mjs';

export async function fetchReviewDecisions(base,token,namespace,request=fetch) {
  const origin=new URL(base);
  if(origin.protocol!=='https:' || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash)throw new Error('NL_REVIEW_SITE_URL 必须是 HTTPS 站点根地址');
  if(!token || token.length<32 || !reviewNamespace.test(namespace || ''))throw new Error('请配置 bot 只读令牌及确认空间');
  const rows=[],seen=new Set();let after='';
  for(let page=0;page<1000;page++) {
    const url=new URL('/api/resource-review',origin);if(after)url.searchParams.set('after',after);
    const res=await request(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw new Error(`拉取确认结果失败（HTTP ${res.status}），未更新本地报告`);
    const result=await res.json();
    if(result.namespace!==namespace || !Array.isArray(result.rows))throw new Error('确认空间或响应格式不匹配');
    for(const row of result.rows) {
      if(!reviewId.test(row.asset_id) || seen.has(row.asset_id) || row.asset_id<=after || !reviewStatuses.includes(row.status) || !Number.isSafeInteger(row.revision) || row.revision<0)throw new Error('云端确认记录或分页结果无效');
      seen.add(row.asset_id);rows.push(row);
    }
    if(!result.next)return rows;
    if(!reviewId.test(result.next) || result.next<=after || result.next!==result.rows.at(-1)?.asset_id)throw new Error('确认分页游标无效');
    after=result.next;
  }
  throw new Error('确认记录超过同步上限');
}
export async function syncReview({repo,env=process.env,request=fetch}) {
  const rows=await fetchReviewDecisions(env.NL_REVIEW_SITE_URL,env.NL_REVIEW_BOT_TOKEN,env.NL_REVIEW_NAMESPACE,request);
  const assets=await scanReviewInbox(repo),states=new Map(rows.map(row=>[row.asset_id,row]));
  const groups={usable:[],unusable:[],pending:[]};
  for(const asset of assets) {
    const row=states.get(asset.id),status=row?.status ?? 'pending';
    groups[status].push({id:asset.id,paths:asset.paths,name:asset.name,kind:asset.kind,bytes:asset.bytes,note:row?.note ?? '',revision:row?.revision ?? null,registered:!!row,reviewedAt:row?.updated_at ?? null});
  }
  const report={version:1,namespace:env.NL_REVIEW_NAMESPACE,fetchedAt:new Date().toISOString(),...groups};
  const dir=path.join(repo,'resource-review'),target=path.join(dir,'decisions.json');await mkdir(dir,{recursive:true});
  if(await realpath(dir)!==path.resolve(dir))throw new Error('确认报告目录不可为符号链接');
  const temp=target+'.'+randomBytes(8).toString('hex')+'.tmp';
  try {const handle=await open(temp,'wx');try{await handle.writeFile(JSON.stringify(report,null,2));await handle.sync();}finally{await handle.close();}await rename(temp,target);}
  finally{await unlink(temp).catch(()=>{});}
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report=await syncReview({repo:fileURLToPath(new URL('../../',import.meta.url))});
    console.log(`已更新 resource-review/decisions.json：可用 ${report.usable.length}，不可用 ${report.unusable.length}，未确认 ${report.pending.length}。未移动或删除任何素材。`);
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
