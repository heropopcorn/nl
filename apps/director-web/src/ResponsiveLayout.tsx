import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

// Keep this breakpoint in sync with responsive.css. Use viewport size, not user-agent.
const compactQuery = '(max-width: 1023px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(compactQuery).matches);
}

export type WorkspacePane = 'canvas' | 'elements' | 'resources' | 'inspector' | 'scenes';
const panes: [WorkspacePane, string][] = [['canvas', '画布'], ['elements', '元素'], ['resources', '资源'], ['inspector', '属性'], ['scenes', '场景']];
export function WorkspaceNavigation({ pane, change }: { pane: WorkspacePane; change: (pane: WorkspacePane) => void }) {
  return <nav className="mobile-navigation" aria-label="工作区切换">
    {panes.map(([id, label]) => <button key={id} aria-pressed={pane === id} aria-controls={`pane-${id}`} onClick={() => change(id)}>{label}</button>)}
  </nav>;
}

// A disclosure, not a separate tree: imports and dialogs survive a viewport resize.
export function HeaderMenu({ children }: { children: ReactNode }) {
  const compact = useCompactLayout(), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!compact) setOpen(false); }, [compact]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <>
    <button ref={trigger} className="mobile-menu-toggle" aria-expanded={open} aria-controls="software-menu" onClick={() => setOpen(!open)}>{open ? '收起菜单 ×' : '菜单 ☰'}</button>
    {compact && open && <div className="menu-backdrop" onClick={close}/>}
    <div id="software-menu" className={`header-actions ${open ? 'menu-open' : ''}`} onKeyDown={e => {
      if (compact && e.key === 'Escape') { e.stopPropagation(); close(); }
    }}>
      {children}
      <button className="mobile-menu-close" onClick={close}>收起菜单</button>
    </div>
  </>;
}

export function MobileSections<T extends string>({ value, change, items, label }: { value: T; change: (value: T) => void; items: readonly (readonly [T, string])[]; label: string }) {
  return <nav className="mobile-sections" aria-label={label}>{items.map(([id, name]) => <button key={id} aria-pressed={value === id} onClick={() => change(id)}>{name}</button>)}</nav>;
}
