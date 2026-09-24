import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const defaultHash = 'ec2d755e7a1a3861377ec07fec7e2b1b:8b20ee7ca6debd70ac1583ec0c826473eee027bfa106679e735c37efccb5fa687c0f3d5ed18ec395dc31abb7085ffaa1cec1bc7e8d66c0d92427dc61f3fabfb6';
const lifetime = 8 * 60 * 60;
const cookieName = 'director_session';
const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

function page(message = '', loggedIn = false) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 导演台</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141a22;color:#eef2f7;font:16px system-ui}main{width:min(400px,90vw);padding:36px;background:#202a37;border:1px solid #384657;border-radius:16px;box-shadow:0 24px 70px #0005}h1{margin:0 0 12px}p{color:#afbed0;line-height:1.6}label{display:block;margin:20px 0 8px}input,button,a{font:inherit}input{width:100%;padding:12px;border:1px solid #56677d;border-radius:7px;background:#141a22;color:white}button,.enter{display:block;text-align:center;width:100%;padding:12px;margin-top:24px;border:0;border-radius:7px;background:#e4bd76;color:#17202c;cursor:pointer;text-decoration:none}.error{color:#ffb2a9;min-height:24px}</style><main><h1>导演台</h1><p>${loggedIn ? '已登录，可以进入场景编辑器。' : '登录后进入场景编辑器'}</p>${loggedIn ? '<a class="enter" href="/index.html">进入编辑器</a><form method="post" action="/logout"><button>退出登录</button></form>' : '<form method="post" action="/login"><label for="username">账号</label><input id="username" name="username" autocomplete="username" required maxlength="80" autofocus><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><p class="error" role="alert">'+message+'</p><button>登录</button></form>'}</main></html>`;
}

function equal(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createAuth({ secret, username = 'admin', passwordHash = defaultHash, now = () => Date.now() } = {}) {
  // No public or predictable fallback signing key. Missing production config
  // fails closed; local server generates its own ephemeral key.
  const configured = typeof secret === 'string' && secret.length >= 32;
  const sign = value => createHmac('sha256', secret).update(value).digest('base64url');
  function valid(request) {
    const token = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    const [expires, signature, extra] = token.split('.');
    return !extra && /^\d+$/.test(expires || '') && Number(expires) > now() && Number(expires) <= now() + lifetime * 1000 && equal(signature || '', sign(expires));
  }
  return async function auth(request) {
    if (!configured) return new Response('登录服务尚未配置 AUTH_SECRET（至少 32 个字符）。', { status: 503, headers });
    const url = new URL(request.url);
    const loggedIn = valid(request);
    const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
    const redirect = (location, setCookie) => new Response(null, { status: 303, headers: { ...headers, Location: location, ...(setCookie ? { 'Set-Cookie': setCookie } : {}) } });
    if (['/login', '/logout'].includes(url.pathname)) {
      if (request.method === 'GET') return new Response(page('', loggedIn), { headers });
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
      if (request.headers.get('origin') !== url.origin) return new Response('请求来源无效', { status: 403, headers });
      if (url.pathname === '/logout') return redirect('/login', cookie('', 0));
      if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('请求格式无效', { status: 400, headers });
      if (Number(request.headers.get('content-length') || 0) > 4096) return new Response('请求过大', { status: 413, headers });
      const body = await request.text();
      if (body.length > 4096) return new Response('请求过大', { status: 413, headers });
      const form = new URLSearchParams(body);
      const password = form.get('password') || '';
      const [salt, expected] = passwordHash.split(':');
      if (!salt || !/^[a-f0-9]{128}$/.test(expected || '')) return new Response('账号配置无效', { status: 503, headers });
      const computed = await derive(password.slice(0, 256), salt, 64);
      if (password.length > 256 || !equal(form.get('username') || '', username) || !equal(computed.toString('hex'), expected)) return new Response(page('账号或密码错误，请重试。'), { status: 401, headers });
      const expires = String(now() + lifetime * 1000);
      return redirect('/index.html', cookie(`${expires}.${sign(expires)}`, lifetime));
    }
    return loggedIn ? null : redirect('/login');
  };
}
