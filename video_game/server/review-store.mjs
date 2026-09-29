// Server/build only. Never import into browser code or expose this key to bots.
export const reviewId = /^[a-f0-9]{64}$/;
export const reviewNamespace = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const reviewStatuses = ['pending','usable','unusable'];
export const reviewError = (message, status=400) => Object.assign(new Error(message), {status});
export function reviewConfig(env=process.env) {
  if (env.NL_REVIEW_ENABLED !== '1') throw reviewError('资源确认未启用；请配置云端确认服务后重新构建',503);
  const namespace=env.NL_REVIEW_NAMESPACE;
  if (!reviewNamespace.test(namespace || '')) throw reviewError('请配置独立的 NL_REVIEW_NAMESPACE',503);
  if (env.VERCEL_ENV==='preview' && !namespace.endsWith('-preview')) throw reviewError('PR 预览必须使用以 -preview 结尾的独立确认空间',503);
  const url=env.NL_REVIEW_SUPABASE_URL, key=env.NL_REVIEW_SUPABASE_SECRET_KEY;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !key) throw reviewError('资源确认数据库尚未配置，请联系部署者',503);
  if (!key.startsWith('sb_secret_')) {
    try {if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='service_role') throw Error();}
    catch {throw reviewError('确认数据库必须使用服务端 secret/service_role 密钥，不能使用 anon 密钥',503);}
  }
  return {namespace,url:url.replace(/\/$/,''),key};
}
export function createReviewStore(env=process.env, request=fetch) {
  const config=reviewConfig(env), {namespace,url,key}=config;
  async function rest(route, options={}) {
    let response;
    try {response=await request(url+'/rest/v1/'+route,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',...options.headers}});}
    catch {throw reviewError('确认数据库连接失败，请检查是否已恢复 Supabase 项目',503);}
    const body=await response.json().catch(()=>null);
    if (!response.ok) {
      if (body?.code==='40001') throw reviewError('此资源已在其他窗口被修改，请刷新云端状态后重试',409);
      // Do not forward database internals, credentials or infrastructure errors.
      throw reviewError('确认数据库不可用，请检查项目状态、迁移和服务端权限',503);
    }
    return body;
  }
  const select='asset_id,name,kind,mime,bytes,status,note,revision,created_at,updated_at,reviewed_by';
  async function list({ids,after}={}) {
    const query=new URLSearchParams({namespace:'eq.'+namespace,select,order:'asset_id.asc',limit:'500'});
    if(ids) {if(!ids.length || ids.length>100 || ids.some(id=>!reviewId.test(id))) throw reviewError('资源 ID 列表无效');query.set('asset_id',`in.(${ids.join(',')})`);}
    if(after) {if(!reviewId.test(after))throw reviewError('分页游标无效');query.set('asset_id','gt.'+after);}
    const rows=await rest('nl_resource_reviews?'+query);
    if(!Array.isArray(rows) || rows.some(r=>!reviewId.test(r.asset_id) || !reviewStatuses.includes(r.status) || !Number.isInteger(r.revision))) throw reviewError('确认数据库返回的数据无效',503);
    return rows;
  }
  async function register(assets) {
    for(let i=0;i<assets.length;i+=100) {
      const rows=assets.slice(i,i+100).map(a=>({namespace,asset_id:a.id,name:a.name,kind:a.kind,mime:a.mime,bytes:a.bytes}));
      // Ignore existing rows: rebuilds must NEVER reset a human decision.
      await rest('nl_resource_reviews?on_conflict=namespace,asset_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)});
    }
  }
  async function decide({id,status,note,revision},reviewer) {
    const row=await rest('rpc/nl_review_decide',{method:'POST',body:JSON.stringify({p_namespace:namespace,p_asset_id:id,p_status:status,p_note:note,p_revision:revision,p_reviewer:reviewer})});
    if(!row || row.asset_id!==id || row.status!==status || row.revision!==revision+1) throw reviewError('确认结果未能验证，请刷新状态，勿假定保存成功',503);
    return row;
  }
  return {namespace,list,register,decide};
}
