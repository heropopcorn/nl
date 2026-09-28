import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ResourceDialog({ children, close, title = '更多资源' }: { children: ReactNode; close: () => void; title?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  return createPortal(<dialog ref={ref} className="resource-dialog" aria-label={title} onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <div className="resource-dialog-heading"><h2>{title === '更多资源' ? '资源浏览器' : title}</h2><span>{title === '更多资源' ? '点击缩略图查看大图，确认后应用' : '视频抽帧 → 筛选排序 → 去底 → 合成 → 保存到自定义分类'}</span><button autoFocus onClick={close} aria-label="关闭资源浏览器">关闭 ×</button></div>
    {children}
  </dialog>, document.body);
}
