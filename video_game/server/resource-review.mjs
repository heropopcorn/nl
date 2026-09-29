import { createAuth } from './auth.mjs';
import { isReviewBotRead } from './review-access.mjs';
import { createReviewStore, reviewId, reviewStatuses, reviewError } from './review-store.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export function createReviewHandler(env=process.env, makeStore=()=>createReviewStore(env)) {
  const auth=createAuth({secret:env.AUTH_SECRET,username:env.ADMIN_USERNAME || 'admin',passwordHash:env.ADMIN_PASSWORD_HASH});
  return async request=>{
    try {
      const url=new URL(request.url);
      if(url.pathname!=='/api/resource-review') return json({error:'接口不存在'},404);
      if(!isReviewBotRead(request,env)) {const denied=await auth(request);if(denied)return denied;}
      if(!['GET','POST'].includes(request.method))return json({error:'不支持此方法'},405);
      const store=makeStore();
      if(request.method==='GET') {
        const ids=url.searchParams.get('ids')?.split(','),after=url.searchParams.get('after') || undefined;
        if(ids && after)throw reviewError('不可同时指定资源列表与分页游标');
        const rows=await store.list({ids,after});
        // A project may configure a lower PostgREST row cap. Continue until an
        // empty page, rather than mistaking a capped page for the end of history.
        return json({namespace:store.namespace,rows,next:!ids && rows.length?rows.at(-1).asset_id:null});
      }
      if(request.headers.get('origin')!==url.origin)throw reviewError('请求来源无效',403);
      if(!request.headers.get('content-type')?.startsWith('application/json'))throw reviewError('请求格式无效');
      // Bound streamed bodies as well as declared Content-Length.
      if(Number(request.headers.get('content-length'))>12000)throw reviewError('请求过大',413);
      let size=0,parts=[];
      if(request.body) for await(const part of request.body) {size+=part.length;if(size>12000)throw reviewError('请求过大',413);parts.push(part);}
      let input;try{input=JSON.parse(Buffer.concat(parts).toString());}catch{throw reviewError('请求 JSON 无效');}
      if(!input || !reviewId.test(input.id) || !reviewStatuses.includes(input.status) || typeof input.note!=='string' || input.note.length>2000 || !Number.isSafeInteger(input.revision) || input.revision<0)throw reviewError('确认参数无效');
      if(input.namespace!==store.namespace)throw reviewError('当前页面与数据库的确认空间不一致，请重新部署或刷新',409);
      const row=await store.decide(input,(env.ADMIN_USERNAME || 'admin').slice(0,80));
      return json({namespace:store.namespace,row});
    } catch(e) {return json({error:e.status?e.message:'资源确认服务暂时不可用'},e.status || 503);}
  };
}

// Node dev/local adapter; Vercel uses the Web Request handler directly.
export async function serveReview(req,res,handler) {
  const request=new Request(new URL(req.url,`http://${req.headers.host}`),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
  const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}
