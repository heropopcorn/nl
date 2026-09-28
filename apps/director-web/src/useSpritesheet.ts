import { useEffect, useRef, useState } from 'react';
import { extractFramesFromVideo } from '../../../packages/spritesheet/spriteExtract';
import { cutoutFrame } from '../../../packages/spritesheet/spriteCutout';
import { DEFAULT_EXTRACT_SETTINGS, DEFAULT_PACK_SETTINGS, moveItem, revokeFrameUrls, type SpriteFrame } from '../../../packages/spritesheet/spriteFrames';
import { drawSpritesheet, layoutSpritesheet, spritesheetJson } from '../../../packages/spritesheet/spritePack';
import { canvasToBlob, loadImageFromFile } from '../../../packages/spritesheet/images';

export function useSpritesheet() {
  const [name, setName] = useState('新序列帧'), [video, setVideo] = useState<File | null>(null);
  const [frames, setFrames] = useState<SpriteFrame[]>([]), [selected, setSelected] = useState('');
  const [extract, setExtract] = useState(DEFAULT_EXTRACT_SETTINGS), [pack, setPack] = useState(DEFAULT_PACK_SETTINGS);
  const [threshold, setThreshold] = useState(38), [crop, setCrop] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [playing, setPlaying] = useState(false), [index, setIndex] = useState(0);
  const [fps, setFps] = useState(12);
  const [packed, setPacked] = useState<null | { blob: Blob; url: string; layout: ReturnType<typeof layoutSpritesheet>; json: ReturnType<typeof spritesheetJson> }>(null);
  const lifetime = useRef({ frames, packed, alive: true, abort: new AbortController() });
  lifetime.current.frames = frames; lifetime.current.packed = packed;
  useEffect(() => { const state = lifetime.current; return () => { state.alive = false; state.abort.abort(); revokeFrameUrls(state.frames); if (state.packed) URL.revokeObjectURL(state.packed.url); }; }, []);
  const active = frames.filter(f => f.enabled);
  useEffect(() => { if (!playing || active.length < 2) return; const timer = setInterval(() => setIndex(i => (i + 1) % active.length), 1000 / Math.max(0.1, fps)); return () => clearInterval(timer); }, [playing, active.length, fps]);
  function invalidate() { if (packed) URL.revokeObjectURL(packed.url); setPacked(null); }
  function changeFrames(next: SpriteFrame[]) { invalidate(); setFrames(next); setIndex(0); }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setStatus('正在处理…');
    try { await fn(); if (lifetime.current.alive) setStatus('处理完成'); }
    catch (e) { if (lifetime.current.alive) setStatus(`处理失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { if (lifetime.current.alive) setBusy(false); }
  }
  function chooseVideo(file: File) { setVideo(file); setName(file.name.replace(/\.[^.]+$/, '')); revokeFrameUrls(frames); changeFrames([]); setSelected(''); setStatus(''); }
  const extractNow = () => run(async () => {
    if (!video) throw new Error('请先选择视频');
    const result = await extractFramesFromVideo(video, extract, p => { if (lifetime.current.alive) setStatus(`抽帧 ${p.current} / ${p.total}`); }, lifetime.current.abort.signal);
    if (!lifetime.current.alive) { revokeFrameUrls(result.frames); return; }
    revokeFrameUrls(frames); changeFrames(result.frames); setSelected(result.frames[0]?.id ?? '');
  });
  const cutout = (all: boolean) => run(async () => {
    const next: SpriteFrame[] = [], created: SpriteFrame[] = [];
    try {
      for (const frame of frames) {
        if (!lifetime.current.alive) throw new Error('已取消');
        if (all ? frame.enabled : frame.id === selected) { const cut = await cutoutFrame(frame, threshold, crop); next.push(cut); created.push(cut); } else next.push(frame);
      }
      if (!lifetime.current.alive) throw new Error('已取消');
      frames.filter(f => created.some(c => c.id === f.id)).forEach(f => URL.revokeObjectURL(f.previewUrl));
      changeFrames(next);
    } catch (e) { revokeFrameUrls(created); throw e; }
  });
  const packNow = () => run(async () => {
    const layout = layoutSpritesheet(frames, pack), images = new Map<string, CanvasImageSource>();
    for (const f of active) images.set(f.id, await loadImageFromFile(f.blob));
    const blob = await canvasToBlob(drawSpritesheet(images, layout));
    if (!lifetime.current.alive) return;
    invalidate(); setPacked({ blob, layout, json: spritesheetJson(layout), url: URL.createObjectURL(blob) });
  });
  return { name, setName, video, chooseVideo, frames, selected, setSelected, active, extract, setExtract, pack, setPack: (value: typeof pack) => { invalidate(); setPack(value); }, threshold, setThreshold, crop, setCrop, busy, status, playing, setPlaying, index, setIndex, fps, setFps, packed, extractNow, cutout, packNow,
    toggle: (id: string, enabled: boolean) => changeFrames(frames.map(f => f.id === id ? { ...f, enabled } : f)),
    enableAll: (enabled: boolean) => changeFrames(frames.map(f => ({ ...f, enabled }))),
    reorder: (from: number, to: number) => changeFrames(moveItem(frames, from, to)),
  };
}
