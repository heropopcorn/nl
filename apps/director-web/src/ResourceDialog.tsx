import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ResourceDialog({ children, close, title = '更多资源', description, compact = false, closeDisabled = false }: { children: ReactNode; close: () => void; title?: string; description?: string; compact?: boolean; closeDisabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current!; d.showModal(); return () => d.close(); }, []);
  return createPortal(<dialog ref={ref} className={`resource-dialog ${compact ? 'compact-dialog' : ''}`} aria-label={title} onCancel={e => { e.preventDefault(); if (!closeDisabled) close(); }} onKeyDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    <div className="resource-dialog-heading"><h2>{title === '更多资源' ? '资源浏览器' : title}</h2><span>{description ?? (title === '更多资源' ? '点击缩略图查看大图，确认后应用' : title === '序列帧制作' ? '视频抽帧 → 筛选排序 → 去底 → 合成 → 保存到自定义分类' : '')}</span><button autoFocus disabled={closeDisabled} onClick={close} aria-label={compact ? `关闭${title}` : '关闭资源浏览器'}>关闭 ×</button></div>
    <div className="resource-dialog-content">{children}</div>
  </dialog>, document.body);
}
