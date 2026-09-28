import { type Project, totalFrames } from '../../../packages/core';
import type { Quality } from '../../../packages/core/backgrounds';
import { DirectorRenderer } from '../../../packages/studios';
export async function exportVideo(project: Project, quality: Quality, start: number, end: number, notify: (s: string) => void, signal: AbortSignal) {
  if (end - start > 18000) throw new Error('单次视频导出最多 10 分钟');
  let id: string | undefined, renderer: DirectorRenderer | undefined;
  async function request(url: string, options: RequestInit = {}) { const response = await fetch(url, { ...options, signal }); if (!response.ok) { const message = await response.text(); throw new Error(message.includes('<') ? '视频服务不可用或登录已过期；请使用 npm start 登录后重试' : message); } return response; }
  try {
    const response = await request('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fps: 30, frames: end - start }) }); id = (await response.json()).id;
    renderer = await DirectorRenderer.create(); const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    for (let f = start; f < end; f++) {
      signal.throwIfAborted(); await renderer.prepare(project, f, quality); renderer.render(project, f, canvas, quality);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('帧输出失败')), 'image/png'));
      await request(`/api/export/${id}/frame`, { method: 'PUT', body: blob }); notify(`视频逐帧编码 ${f - start + 1} / ${end - start}`);
    }
    for (const track of project.audioTracks.filter(t => !t.muted)) {
      const begin = Math.max(start, track.startFrame), finish = Math.min(end, track.startFrame + track.frames);
      if (begin >= finish) continue;
      const asset = project.assets.find(a => a.id === track.assetId); if (!asset) throw new Error(`音轨资源缺失：${track.name}`);
      const data = await (await fetch(asset.src, { signal })).blob();
      await request(`/api/export/${id}/audio`, { method: 'POST', headers: { 'X-Audio-Meta': JSON.stringify({ start: (begin - start) / 30, offset: (track.offsetFrame + begin - track.startFrame) / 30, duration: (finish - begin) / 30, volume: track.volume }) }, body: data });
    }
    notify('正在完成视频封装与音轨混合…'); await request(`/api/export/${id}/finish`, { method: 'POST' });
    const output = await (await request(`/api/export/${id}/result`)).blob(); return output;
  } finally { renderer?.dispose(); if (id) await fetch(`/api/export/${id}`, { method: 'DELETE' }).catch(() => {}); }
}
