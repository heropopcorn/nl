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
import { createReviewHandler, serveReview } from '../../video_game/server/resource-review.mjs';

if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET) throw new Error('生产环境必须设置 AUTH_SECRET（至少 32 字符）');
const mode = process.env.NL_MODE || 'preview';
const root = await realpath(fileURLToPath(new URL('./' + buildPaths({...process.env, NL_MODE:mode, NL_ASSET_PROFILE:mode === 'local' ? 'full' : process.env.NL_ASSET_PROFILE}).outDir, import.meta.url)));
const config = JSON.parse(await readFile(path.join(root, 'runtime.json'), 'utf8'));
if (process.env.NL_MODE && config.mode !== process.env.NL_MODE) throw new Error('构建模式与运行模式不一致，请重新构建');
if (config.mode === 'local' && process.env.HOST && process.env.HOST !== '127.0.0.1') throw new Error('本地工作模式必须监听 127.0.0.1');
const workspace = config.mode === 'local' ? await createWorkspaceService(await resolveWorkspace({repo:fileURLToPath(new URL('../../',import.meta.url)),argument:process.env.NL_WORKSPACE}), (await import('./.local-runtime/core.mjs')).projectSchema.parse) : null;
const authSecret = process.env.AUTH_SECRET || randomBytes(48).toString('hex');
const auth = createAuth({ secret: authSecret, username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH });
const reviewHandler = createReviewHandler({...process.env,AUTH_SECRET:authSecret});
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.apng':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.mp4':'video/mp4', '.webm':'video/webm', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/api/')) {
      if (new URL(req.url, `http://${req.headers.host}`).pathname === '/api/resource-review') { await serveReview(req,res,reviewHandler); return; }
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
    const info=await stat(file);
    if (!file.startsWith(root + path.sep) || !info.isFile()) { res.writeHead(404); res.end(); return; }
    let start=0,end=info.size-1,status=200;
    if(req.headers.range) {
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(range && (range[1] || range[2])) {
        start=range[1]?Number(range[1]):Math.max(0,info.size-Number(range[2]));
        end=range[1]&&range[2]?Math.min(Number(range[2]),info.size-1):info.size-1;
      } else start=Infinity;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size) {res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      status=206;
    }
    res.writeHead(status, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length':info.size?end-start+1:0, 'Accept-Ranges':'bytes', ...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`} : {}), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD' || !info.size) res.end(); else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
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
