import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createAuth } from './auth.mjs';

const password = 'test-only-password';
const passwordHash = 'testsalt:' + scryptSync(password, 'testsalt', 64).toString('hex');
const secret = 'test-secret-not-used-in-production-123456789';
const request = (url, options = {}) => new Request('https://example.test' + url, options);
const post = (passwordValue, origin = 'https://example.test') => request('/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: 'admin', password: passwordValue }) });

test('protect page and binary resources, login, forged and expired sessions, logout', async () => {
  let time = 100000000;
  const auth = createAuth({ secret, passwordHash, now: () => time });
  for (const url of ['/', '/index.html', '/index.js', '/index.wasm', '/index.pck']) assert.equal((await auth(request(url))).headers.get('location'), '/login');
  assert.equal((await auth(post('wrong'))).status, 401);
  assert.equal((await auth(post(password, 'https://other.test'))).status, 403);
  const success = await auth(post(password));
  assert.equal(success.status, 303);
  const setCookie = success.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly; SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  const cookie = setCookie.split(';')[0];
  assert.equal(await auth(request('/index.wasm', { headers: { cookie } })), null);
  assert.equal((await auth(request('/', { headers: { cookie: cookie + 'tampered' } }))).status, 303);
  const logout = await auth(request('/logout', { method: 'POST', headers: { origin: 'https://example.test', cookie } }));
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  time += 8 * 60 * 60 * 1000 + 1;
  assert.equal((await auth(request('/', { headers: { cookie } }))).status, 303);
});
test('missing production secret fails closed', async () => {
  assert.equal((await createAuth()(request('/'))).status, 503);
});
