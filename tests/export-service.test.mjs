import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleExport } from '../apps/director-web/export-service.mjs';
test('video jobs validate inputs, ownership, origin, completion and cancellation', async () => {
  const server = http.createServer((req, res) => handleExport(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = 'POST', data, cookie = 'owner=A', source = origin) => fetch(origin + path, { method, headers: { Origin: source, Cookie: cookie, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  try {
    assert.equal((await call('/api/export', 'POST', { fps: 30, frames: 3 }, 'owner=A', 'http://other.test')).status, 403);
    assert.equal((await call('/api/export', 'POST', { fps: 30, frames: -1 })).status, 400);
    const created = await call('/api/export', 'POST', { fps: 30, frames: 3 }); assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal((await call(`/api/export/${id}/result`, 'GET', undefined, 'owner=B')).status, 404);
    assert.equal((await call(`/api/export/${id}/finish`)).status, 400);
    assert.equal((await call(`/api/export/${id}/frame`, 'PUT', { invalid: true })).status, 400);
    assert.equal((await call(`/api/export/${id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/api/export/${id}/result`, 'GET')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
