import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RegionEffectType, RegionHit } from './region-actions';
import './canvas-context-menu.css';

export type RegionAction = 'properties' | 'vertices' | 'redraw' | 'add' | 'move' | 'scale' | 'rotate' | 'delete';
export type RegionShape = 'lasso' | 'rect';
const kinds: [RegionEffectType, string][] = [['water', '水流区域'], ['fog', '雾气区域'], ['rain', '降雨区域'], ['snow', '降雪区域'], ['cutout', '背景遮挡块']];

export function CanvasContextMenu({ anchor, hits, target, targetValid, canAdd, changeTarget, action, create, close }: {
  anchor: { x: number; y: number }; hits: RegionHit[]; target: RegionHit | undefined; targetValid: boolean; canAdd: boolean;
  changeTarget: (value: string) => void; action: (action: RegionAction) => void;
  create: (kind: RegionEffectType, shape: RegionShape) => void; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null), outsideDown = useRef(false);
  const [shape, setShape] = useState<RegionShape>('lasso');
  const dismiss = () => { ref.current?.close(); close(); };
  const run = (fn: () => void) => { dismiss(); fn(); };
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const place = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      dialog.style.maxHeight = `${Math.max(80, height - 16)}px`;
      dialog.style.maxWidth = `${Math.max(80, width - 16)}px`;
      const rect = dialog.getBoundingClientRect();
      dialog.style.left = `${Math.max(left + 8, Math.min(anchor.x, left + width - rect.width - 8))}px`;
      dialog.style.top = `${Math.max(top + 8, Math.min(anchor.y, top + height - rect.height - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(dialog);
    window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place); dialog.close(); };
  }, [anchor.x, anchor.y]);
  const outside = (x: number, y: number) => { const rect = ref.current!.getBoundingClientRect(); return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom; };
  return createPortal(<dialog ref={ref} className="canvas-context-menu" aria-label="画布快捷菜单"
    onCancel={event => { event.preventDefault(); dismiss(); }} onKeyDown={event => event.stopPropagation()}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => { event.stopPropagation(); outsideDown.current = event.target === ref.current && outside(event.clientX, event.clientY); }}
    onPointerUp={event => { event.stopPropagation(); if (outsideDown.current && outside(event.clientX, event.clientY)) dismiss(); outsideDown.current = false; }}>
    <div className="context-heading"><strong>{target ? `${target.name} · 区域 ${target.index + 1}` : '新建区域'}</strong><button autoFocus aria-label="关闭画布快捷菜单" onClick={dismiss}>关闭 ×</button></div>
    {hits.length > 1 && <label>此处有多个区域<select aria-label="选择命中的区域" value={target ? `${target.effectId}:${target.index}` : ''} onChange={event => changeTarget(event.target.value)}>{hits.map(hit => <option key={`${hit.effectId}:${hit.index}`} value={`${hit.effectId}:${hit.index}`}>{hit.name} · 区域 {hit.index + 1}</option>)}</select></label>}
    {target && <>
      {!targetValid && <p role="alert">此范围已改变，请关闭菜单后重新选择。</p>}
      <div className="context-actions">
        <button disabled={!targetValid} onClick={() => run(() => action('properties'))}>区域属性</button>
        <button disabled={!targetValid} onClick={() => run(() => action('vertices'))}>编辑区域顶点</button>
        <button disabled={!targetValid} onClick={() => run(() => action('redraw'))}>重绘此区域</button>
        <button disabled={!targetValid || !canAdd} onClick={() => run(() => action('add'))}>添加同类区域</button>
        <button disabled={!targetValid} onClick={() => run(() => action('move'))}>移动此区域</button>
        <button disabled={!targetValid} onClick={() => run(() => action('scale'))}>缩放此区域</button>
        <button disabled={!targetValid} onClick={() => run(() => action('rotate'))}>旋转此区域</button>
        <button className="danger" disabled={!targetValid} onClick={() => run(() => action('delete'))}>删除此区域</button>
      </div><p className="context-note">删除仅影响这一块范围，不删除其他区域或整个元素；误删可用顶部菜单的“撤销”恢复。</p>
    </>}
    <div className="context-create"><h2>新建区域</h2><label>绘制方式<select aria-label="新建区域绘制方式" value={shape} onChange={event => setShape(event.target.value as RegionShape)}><option value="lasso">套索绘制（逐点点击）</option><option value="rect">矩形框选（按住拖动）</option></select></label>
      {kinds.map(([kind, label]) => <button key={kind} onClick={() => run(() => create(kind, shape))}>新建{label}</button>)}
      <p className="context-note">选择类型后在画布绘制，完成才会创建；取消绘制不留空元素。</p>
    </div>
  </dialog>, document.body);
}
