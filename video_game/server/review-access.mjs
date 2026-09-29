import { timingSafeEqual } from 'node:crypto';
export function isReviewBotRead(request, env=process.env) {
  if(request.method!=='GET' || new URL(request.url).pathname!=='/api/resource-review' || env.NL_REVIEW_ENABLED!=='1') return false;
  const secret=env.NL_REVIEW_BOT_TOKEN;
  if(typeof secret!=='string' || secret.length<32) return false;
  const value=Buffer.from(request.headers.get('authorization') || ''), expected=Buffer.from('Bearer '+secret);
  return value.length===expected.length && timingSafeEqual(value,expected);
}
