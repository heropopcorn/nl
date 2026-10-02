import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';

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
    {panes.map(([id, label]) => <button key={id} aria-label={label} aria-pressed={pane === id} aria-expanded={id === 'canvas' ? undefined : pane === id} aria-controls={id === 'elements' || id === 'resources' ? 'pane-left' : `pane-${id}`} onClick={() => change(pane === id ? 'canvas' : id)}><span aria-hidden="true" className="drawer-direction">{id === 'elements' || id === 'resources' ? '→' : id === 'inspector' ? '←' : id === 'scenes' ? '↑' : '◇'}</span>{label}</button>)}
  </nav>;
}

// The panel stays in its desktop DOM position: resizing never remounts editors,
// file inputs or dialogs. Drawers also work inside a native dialog's top layer.
export function MobileDrawer({ id, title, side, open, onClose, className = '', as: Tag = 'div', children }: {
  id: string; title: string; side: 'left' | 'right' | 'bottom'; open: boolean; onClose: () => void;
  className?: string; as?: 'aside' | 'section' | 'div'; children: ReactNode;
}) {
  const compact = useCompactLayout(), active = compact && open;
  const panel = useRef<HTMLElement>(null), backdrop = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    if (!active || !panel.current) return;
    const element = panel.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const boundary = element.closest('dialog') ?? element.closest('.app') ?? document.body;
    // Capture the fallback now; cleanup can run midway through React's DOM
    // updates, when different disclosure buttons have different expanded values.
    const trigger = boundary.querySelector<HTMLElement>(`button[aria-controls="${id}"][aria-expanded=true]`) ??
      boundary.querySelector<HTMLElement>(`button[aria-controls="${id}"]`);
    const changed: [HTMLElement, boolean][] = [];
    // Block pointer and keyboard edits behind the drawer, but not a later native
    // dialog (uploads / previews are portalled to body and own their focus).
    let branch: HTMLElement = element;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling instanceof HTMLElement && sibling !== branch && sibling !== backdrop.current && !sibling.classList.contains('mobile-drawer') && !sibling.classList.contains('mobile-drawer-backdrop')) {
          changed.push([sibling, sibling.inert]); sibling.inert = true;
        }
      }
      if (parent === boundary) break;
      branch = parent;
    }
    element.querySelector<HTMLButtonElement>('.mobile-drawer-heading button')?.focus({ preventScroll: true });
    // A child layout effect can run before its native dialog calls showModal().
    // Retry after that dialog enters the top layer, without stealing valid focus.
    const focusFrame = requestAnimationFrame(() => {
      const modals = document.querySelectorAll('dialog[open]');
      const top = modals.item(modals.length - 1);
      if ((!top || top.contains(element)) && !element.contains(document.activeElement)) {
        element.querySelector<HTMLButtonElement>('.mobile-drawer-heading button')?.focus({ preventScroll: true });
      }
    });
    const key = (event: KeyboardEvent) => {
      const modals = document.querySelectorAll('dialog[open]');
      const top = modals.item(modals.length - 1);
      if (top && !top.contains(element)) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close.current();
      } else if (event.key === 'Tab') {
        const targets = Array.from(element.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
          .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length > 0);
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', key, true);
      changed.forEach(([node, inert]) => { node.inert = inert; });
      // Do not steal focus from a newly opened native dialog or another drawer.
      if (element.contains(document.activeElement) || document.activeElement === document.body || document.activeElement === boundary) {
        const valid = (node: HTMLElement | null): node is HTMLElement => !!node && node !== document.body && node.isConnected &&
          boundary.contains(node) && !node.closest('[inert]') && node.getClientRects().length > 0;
        // On a modal's first mount the previous focus is outside that modal;
        // return to its own disclosure instead of its implicitly inert opener.
        const target = valid(previous) ? previous : valid(trigger) ? trigger : null;
        target?.focus({ preventScroll: true });
      }
    };
  }, [active, id]);
  return <>
    {active && <button ref={backdrop} className="mobile-drawer-backdrop" aria-label={`收起${title}`} tabIndex={-1} onClick={onClose}/>}
    <Tag ref={panel as Ref<HTMLDivElement & HTMLElement>} id={id} className={`mobile-drawer ${className}`} data-side={side} data-open={active}
      role={active ? 'dialog' : undefined} aria-modal={active ? true : undefined} aria-label={title} inert={compact && !open ? true : undefined}
      onKeyDown={event => { if (active) event.stopPropagation(); }}>
      <div className="mobile-drawer-heading"><strong>{title}</strong><button type="button" aria-label={`关闭${title}`} onClick={onClose}>收起 ×</button></div>
      <div className="mobile-drawer-content">{children}</div>
    </Tag>
  </>;
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
