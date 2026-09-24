import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createAuth } from './auth.mjs';

const root = await realpath(fileURLToPath(new URL('../export/web', import.meta.url)));
const auth = createAuth({ secret: process.env.AUTH_SECRET || randomBytes(48).toString('hex'), username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const origin = `http://${req.headers.host}`;
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const request = new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const denied = await auth(request);
    if (denied) {
      res.writeHead(denied.status, Object.fromEntries(denied.headers));
      res.end(Buffer.from(await denied.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = await realpath(path.join(root, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log(`导演台登录服务：http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 8080}/`));
