import { z } from 'zod';
const id=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewStatus=z.enum(['pending','usable','unusable']);
const itemSchema=z.object({id,name:z.string().min(1).max(255),kind:z.enum(['image','animation','video']),mime:z.string(),bytes:z.number().int().positive(),url:z.string()})
  .refine(a=>new RegExp(`^/resource-review/media/${a.id}\\.(png|apng|jpg|jpeg|gif|webp|mp4|webm)$`).test(a.url),'预览资源地址无效');
const count=z.number().int().nonnegative();
const scanSchema=z.object({source:z.literal('resource-review/inbox/'),files:count,uniqueAssets:count,images:count,animations:count,videos:count,pending:count,reviewed:count})
  .refine(s=>s.files>=s.uniqueAssets && s.images+s.animations+s.videos===s.uniqueAssets && s.pending+s.reviewed===s.uniqueAssets,'确认批次扫描统计无效');
const manifestSchema=z.object({version:z.literal(1),enabled:z.boolean(),namespace:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).nullable(),generatedAt:z.string(),items:z.array(itemSchema).max(500),scan:scanSchema.optional()})
  .refine(m=>(!m.enabled || !!m.namespace) && new Set(m.items.map(a=>a.id)).size===m.items.length && (!m.scan || (m.enabled && m.scan.pending===m.items.length)),'确认清单无效');
const rowSchema=z.object({asset_id:id,status:reviewStatus,note:z.string().max(2000),revision:z.number().int().nonnegative(),updated_at:z.string(),reviewed_by:z.string().nullable().optional()});
export type ReviewItem=z.infer<typeof itemSchema>;
export type ReviewRow=z.infer<typeof rowSchema>;
export type ReviewManifest=z.infer<typeof manifestSchema>;
export type ReviewStatus=z.infer<typeof reviewStatus>;
async function request(url:string,options?:RequestInit) {
  const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.status===401 || response.redirected)throw new Error('登录已过期，请在新窗口重新登录后刷新确认状态');
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('资源确认服务未部署或响应无效，请检查构建及接口配置');
  const value=await response.json();
  if(!response.ok)throw new Error(value.error || `确认服务不可用（${response.status}）`);
  return value;
}
export async function loadReviewManifest() {return manifestSchema.parse(await request('/resource-review/manifest.json'));}
export async function loadReviewRows(manifest:ReviewManifest) {
  const rows:Record<string,ReviewRow>={};
  if(!manifest.enabled)return rows;
  // Even an empty batch checks the configured database namespace/availability.
  const batches=manifest.items.length?Math.ceil(manifest.items.length/100):1;
  for(let i=0;i<batches;i++) {
    const ids=manifest.items.slice(i*100,(i+1)*100).map(a=>a.id);
    const data=await request('/api/resource-review'+(ids.length?'?ids='+ids.join(','):''));
    if(data.namespace!==manifest.namespace)throw new Error('当前页面与云端确认空间不一致，请重新部署');
    const parsed=z.array(rowSchema).parse(data.rows);
    parsed.forEach(row=>{rows[row.asset_id]=row;});
    if(ids.some(id=>!rows[id]))throw new Error('云端缺少本批次资源记录，请重新发布；不会将缺失记录视作未确认');
  }
  return rows;
}
export async function decideReview(namespace:string,item:ReviewItem,row:ReviewRow,status:ReviewStatus,note:string) {
  const data=await request('/api/resource-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({namespace,id:item.id,status,note,revision:row.revision})});
  if(data.namespace!==namespace)throw new Error('确认空间不一致，请刷新核对结果');
  const next=rowSchema.parse(data.row);
  if(next.asset_id!==item.id || next.status!==status || next.revision!==row.revision+1)throw new Error('确认结果未能验证，请刷新后核对');
  return next;
}
