import { useCallback, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { type Project } from '../../../packages/core';
import { ProjectHistory } from './project-history';

export function useProjectDocument(initial: () => Project, guard: () => string | null, notify: (message: string) => void, dirty: () => void) {
  const [document] = useState(() => new ProjectHistory(initial()));
  const [project, setProject] = useState(document.current);
  const callbacks = useRef({ guard, notify, dirty }); callbacks.current = { guard, notify, dirty };
  const interaction = useRef<string | undefined>(undefined), focused = useRef<{ target: EventTarget; id: string } | null>(null);
  const publish = () => { callbacks.current.dirty(); setProject(document.current); };
  const edit = useCallback((change: (p: Project) => void) => {
    const blocked = callbacks.current.guard();
    if (blocked) { callbacks.current.notify(blocked); return false; }
    try { if (document.edit(change, interaction.current)) publish(); return true; }
    catch (error) {
      const issues = (error as { issues?: { message: string; path: PropertyKey[] }[] }).issues;
      callbacks.current.notify(issues ? `参数未应用：${issues[0].path.join('.')} · ${issues[0].message}` : `操作未完成：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [document]);
  const replace = useCallback((next: Project) => { if (document.replace(next)) publish(); }, [document]);
  const hydrate = useCallback((next: Project) => { document.hydrate(next); setProject(next); }, [document]);
  const history = useCallback((back: boolean) => {
    const blocked = callbacks.current.guard(); if (blocked) { callbacks.current.notify(blocked); return; }
    if (document.travel(back)) { publish(); callbacks.current.notify(back ? '已撤销，可重做' : '已重做'); }
  }, [document]);
  function capture(event: FormEvent) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || (target instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(target.type))) return;
    if (focused.current?.target !== target) focused.current = { target, id: crypto.randomUUID() };
    const key = focused.current.id; interaction.current = key;
    // Only edits made by this change event are grouped, never later async work.
    queueMicrotask(() => { if (interaction.current === key) interaction.current = undefined; });
  }
  function beginGesture(event: PointerEvent) {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
      document.endGroup(); focused.current = { target: event.target, id: crypto.randomUUID() };
    }
  }
  return { project, edit, replace, hydrate, history, current: () => document.current, canUndo: document.canUndo, canRedo: document.canRedo,
    inputHandlers: { onChangeCapture: capture, onPointerDownCapture: beginGesture, onBlurCapture: () => { focused.current = null; document.endGroup(); } } };
}
