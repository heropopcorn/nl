import { useEffect, useRef, useState } from 'react';
import { NumberField } from './NumberField';
import { reviewPreviewSize, reviewSequenceError, reviewSequenceRect } from './review-sequence';
import './review-sequence.css';

/** Viewing settings are local to this image; they never modify the review manifest or its verdict. */
export function ReviewSequencePreview({ url, name }: { url: string; name: string }) {
  return <SequenceImage key={url} url={url} name={name}/>;
}

function SequenceImage({ url, name }: { url: string; name: string }) {
  const source = useRef<HTMLImageElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 }), [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState(false), [columns, setColumns] = useState(1), [rows, setRows] = useState(1), [count, setCount] = useState(1), [fps, setFps] = useState(12);
  const [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false), [drawError, setDrawError] = useState('');
  const error = reviewSequenceError(dimensions.width, dimensions.height, columns, rows, count);
  const ready = enabled && !error && !drawError, current = Math.min(frame, count - 1);
  function stopAt(index: number) { setPlaying(false); setFrame((index + count) % count); }
  function changeGrid(nextColumns: number, nextRows: number) {
    setPlaying(false); setFrame(0); setColumns(nextColumns); setRows(nextRows); setCount(nextColumns * nextRows);
  }
  useEffect(() => {
    if (!ready || !playing || count < 2) return;
    const timer = window.setInterval(() => setFrame(value => (value + 1) % count), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [ready, playing, count, fps]);
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => document.removeEventListener('visibilitychange', pauseHidden);
  }, []);
  useEffect(() => {
    if (!enabled || error || !source.current || !canvas.current) return;
    try {
      const rect = reviewSequenceRect(dimensions.width, dimensions.height, columns, rows, current);
      const size = reviewPreviewSize(rect.width, rect.height), target = canvas.current;
      target.width = size.width; target.height = size.height;
      const context = target.getContext('2d');
      if (!context) throw new Error('浏览器暂不支持画布预览');
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(source.current, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height);
      setDrawError('');
    } catch (e) { setPlaying(false); setDrawError(`无法显示当前帧：${e instanceof Error ? e.message : String(e)}`); }
  }, [enabled, error, dimensions, columns, rows, current]);
  return <div className="review-sequence-preview">
    <div className="review-stage">
      <img ref={source} src={url} alt={`资源大图 ${name}`} hidden={enabled && !error} onLoad={event => { setFailed(false); setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} onError={() => { setFailed(true); setPlaying(false); setDimensions({ width: 0, height: 0 }); }}/>
      {enabled && !error && <canvas ref={canvas} role="img" aria-label={`序列帧预览 ${name}`} data-frame={current + 1}/>}
    </div>
    {failed && <p role="alert">图片加载失败，请重新选择资源或刷新列表。</p>}
    <label className="review-sequence-toggle"><input type="checkbox" checked={enabled} disabled={!dimensions.width || failed} onChange={event => { setEnabled(event.target.checked); setPlaying(false); setFrame(0); }}/>按序列帧查看</label>
    {enabled && <div className="review-sequence-settings">
      {(error || drawError) && <p role="alert">{error || drawError}</p>}
      <p className="review-sequence-position" aria-label="序列帧预览位置">第 {current + 1} / {count} 帧{playing ? ' · 播放中' : ' · 已暂停'}</p>
      <div className="review-sequence-controls">
        <button disabled={!ready} onClick={() => stopAt(current - 1)}>上一帧</button>
        <button disabled={!ready || count < 2} onClick={() => setPlaying(value => !value)}>{playing ? '暂停序列帧' : '播放序列帧'}</button>
        <button disabled={!ready} onClick={() => stopAt(current + 1)}>下一帧</button>
      </div>
      <label className="review-sequence-scrub">选择预览帧<input type="range" min={1} max={count} step={1} value={current + 1} disabled={!ready} onChange={event => stopAt(Number(event.target.value) - 1)}/></label>
      <small>暂停会停留在当前帧，可逐帧检查；检查后在下方选择“标记可用”或“标记不可用”。</small>
      <h4>图集设置</h4>
      <div className="review-sequence-fields">
        <label>图集列数<NumberField min={1} max={64} step={1} value={columns} onValueChange={value => changeGrid(value, rows)}/></label>
        <label>图集行数<NumberField min={1} max={64} step={1} value={rows} onValueChange={value => changeGrid(columns, value)}/></label>
        <label>有效帧数<NumberField min={1} max={columns * rows} step={1} value={count} onValueChange={value => { setCount(value); setFrame(0); setPlaying(false); }}/></label>
        <label>预览 FPS<NumberField min={0.1} max={60} step={0.1} value={fps} onValueChange={setFps}/></label>
      </div>
      <small>原图 {dimensions.width} × {dimensions.height}；有效帧数可排除图集末尾的空格。</small>
      <p className="review-sequence-hint">手动填写等尺寸、无间距图集的行列，从左到右、从上到下播放。独立帧文件或不规则图集需要帧信息，不能自动推断。这里只调整预览，不修改资源或确认记录。</p>
      <button className="review-preview-return" disabled={!ready} onClick={() => canvas.current?.scrollIntoView({ block: 'start' })}>设置完成，返回帧预览</button>
    </div>}
  </div>;
}
