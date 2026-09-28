import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const jobs = new Map();
const owner = req => createHash('sha256').update(req.headers.cookie || 'local-development').digest('hex');
const answer = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req, limit) { let size = 0; const parts = []; for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('请求超过大小限制'); parts.push(chunk); } return Buffer.concat(parts); }
function run(args) {
  const child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-4000); }); child.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg 编码失败：${error}`))); });
  done.catch(() => {}); return { child, done };
}
async function cleanup(id) { const job = jobs.get(id); if (!job) return; jobs.delete(id); job.process?.child.kill('SIGKILL'); job.mux?.child.kill('SIGKILL'); await rm(job.directory, { recursive: true, force: true }); }
const sweeper = setInterval(() => { for (const [id, job] of jobs) if (Date.now() - job.touched > 15 * 60_000) cleanup(id).catch(() => {}); }, 60_000); sweeper.unref();
export async function handleExport(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (!pathname.startsWith('/api/export')) return false;
  try {
    const origin = req.headers.origin;
    if (req.method !== 'GET' && (!origin || new URL(origin).host !== req.headers.host)) { answer(res, 403, { error: '来源无效' }); return true; }
    const parts = pathname.split('/').filter(Boolean);
    if (req.method === 'POST' && parts.length === 2) {
      if (jobs.size >= 2) throw new Error('最多同时两个导出任务，请等待或取消旧任务');
      const config = JSON.parse((await body(req, 8192)).toString());
      if (config.fps !== 30 || !Number.isInteger(config.frames) || config.frames < 1 || config.frames > 18000) throw new Error('导出须为 30fps，最多 10 分钟');
      const id = randomBytes(24).toString('hex'), directory = await mkdtemp(path.join(tmpdir(), 'yuanli-export-'));
      const process = run(['-f', 'image2pipe', '-framerate', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, 'silent.mp4')]);
      const job = { owner: owner(req), directory, process, frames: config.frames, received: 0, busy: false, state: 'frames', audio: [], touched: Date.now(), error: null };
      process.done.catch(error => { job.error = String(error); }); jobs.set(id, job); answer(res, 201, { id }); return true;
    }
    const id = parts[2], job = jobs.get(id);
    if (!job || job.owner !== owner(req)) { answer(res, 404, { error: '导出任务不存在' }); return true; }
    job.touched = Date.now();
    if (req.method === 'DELETE') { await cleanup(id); answer(res, 200, { cancelled: true }); return true; }
    if (job.error) throw new Error(job.error);
    if (req.method === 'PUT' && parts[3] === 'frame') {
      if (job.busy || job.state !== 'frames' || job.received >= job.frames) throw new Error('帧上传状态无效');
      job.busy = true;
      try {
        const data = await body(req, 8 * 1024 * 1024);
        if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.readUInt32BE(16) !== 1280 || data.readUInt32BE(20) !== 720) throw new Error('仅接收 1280×720 PNG 帧');
        await new Promise((resolve, reject) => job.process.child.stdin.write(data, error => error ? reject(error) : resolve())); job.received++;
        answer(res, 200, { received: job.received });
      } finally { job.busy = false; }
      return true;
    }
    if (req.method === 'POST' && parts[3] === 'audio') {
      if (job.state !== 'frames' || job.audio.length >= 16) throw new Error('音轨状态无效');
      const meta = JSON.parse(req.headers['x-audio-meta'] || '{}');
      for (const key of ['start', 'offset', 'duration', 'volume']) if (!Number.isFinite(meta[key]) || meta[key] < 0) throw new Error('音轨参数无效');
      if (meta.start > 600 || meta.offset > 6000 || meta.duration > 600 || meta.volume > 2) throw new Error('音轨参数超限');
      const file = path.join(job.directory, `audio-${job.audio.length}.bin`); await writeFile(file, await body(req, 20 * 1024 * 1024)); job.audio.push({ ...meta, file }); answer(res, 200, { ok: true }); return true;
    }
    if (req.method === 'POST' && parts[3] === 'finish') {
      if (job.busy || job.state !== 'frames' || job.received !== job.frames) throw new Error('帧数不完整，不能结束编码');
      job.state = 'encoding'; job.process.child.stdin.end(); await job.process.done;
      let output = path.join(job.directory, 'silent.mp4');
      if (job.audio.length) {
        const args = ['-i', output]; job.audio.forEach(a => args.push('-protocol_whitelist', 'file,pipe', '-format_whitelist', 'wav,mp3,ogg,flac,mov,matroska,webm,aac', '-i', a.file));
        const filters = job.audio.map((a, i) => `[${i + 1}:a]atrim=start=${a.offset}:duration=${a.duration},asetpts=PTS-STARTPTS,volume=${a.volume},adelay=${Math.round(a.start * 1000)}:all=1[a${i}]`);
        filters.push(`${job.audio.map((_, i) => `[a${i}]`).join('')}amix=inputs=${job.audio.length}:normalize=0,apad[mix]`);
        output = path.join(job.directory, 'final.mp4'); args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-t', String(job.frames / 30), '-movflags', '+faststart', output);
        job.mux = run(args); job.mux.child.stdin.end(); await job.mux.done;
      }
      job.output = output; job.state = 'ready'; answer(res, 200, { ready: true }); return true;
    }
    if (req.method === 'GET' && parts[3] === 'result' && job.state === 'ready') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': (await stat(job.output)).size, 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="director.mp4"' }); createReadStream(job.output).pipe(res); return true;
    }
    answer(res, 400, { error: '无效导出请求' });
  } catch (error) { if (!res.headersSent) answer(res, 400, { error: String(error) }); else res.end(); }
  return true;
}
