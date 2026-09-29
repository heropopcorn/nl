import { createWorkspaceService } from './workspace-service.mjs';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAuth } from '../../video_game/server/auth.mjs';
import { handleExport } from './export-service.mjs';
import { buildPaths } from './build-paths.mjs';
import { resolveWorkspace } from './workspace-location.mjs';

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) throw new Error('生产环境必须设置 AUTH_SECRET（至少 32 字符）');
const mode = process.env.NL_MODE || 'preview';
const root = await realpath(fileURLToPath(new URL('./' + buildPaths({...process.env, NL_MODE:mode, NL_ASSET_PROFILE:mode === 'local' ? 'full' : process.env.NL_ASSET_PROFILE}).outDir, import.meta.url)));
const config = JSON.parse(await readFile(path.join(root, 'runtime.json'), 'utf8'));
if (process.env.NL_MODE && config.mode !== process.env.NL_MODE) throw new Error('构建模式与运行模式不一致，请重新构建');
if (config.mode === 'local' && process.env.HOST && process.env.HOST !== '127.0.0.1') throw new Error('本地工作模式必须监听 127.0.0.1');
const workspace = config.mode === 'local' ? await createWorkspaceService(await resolveWorkspace({repo:fileURLToPath(new URL('../../',import.meta.url)),argument:process.env.NL_WORKSPACE}), (await import('./.local-runtime/core.mjs')).projectSchema.parse) : null;
const auth = createAuth({ secret: process.env.AUTH_SECRET || randomBytes(48).toString('hex'), username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      const request = new Request(new URL(req.url, `http://${req.headers.host}`), { method: req.method, headers: req.headers });
      const denied = await auth(request);
      if (denied) { res.writeHead(denied.status, Object.fromEntries(denied.headers)); res.end(Buffer.from(await denied.arrayBuffer())); return; }
      if (workspace && await workspace.handler(req, res)) return;
      if (workspace && await handleExport(req, res)) return;
      res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '此接口仅在本地工作模式可用' })); return;
    }
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > 4096) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const request = new Request(new URL(req.url, `http://${req.headers.host}`), { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
    const denied = await auth(request);
    if (denied) { res.writeHead(denied.status, Object.fromEntries(denied.headers)); res.end(Buffer.from(await denied.arrayBuffer())); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const file = await realpath(path.join(root, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', resolve);
  });
} catch (error) {
  await workspace?.close();
  throw error;
}
console.log(`导演台：http://${process.env.HOST || '127.0.0.1'}:${server.address().port}`);

if (workspace) console.log('本地工作目录：' + workspace.directory);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await workspace?.close(); process.exit(0); });
  server.closeIdleConnections();
});
