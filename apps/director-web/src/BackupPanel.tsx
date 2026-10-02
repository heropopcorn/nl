import { ResourceDialog } from './ResourceDialog';
import { isLocalWork } from './runtime';
import { useRef, useState } from 'react';
import type { Project } from '../../../packages/core';
import { listProjectBackups, saveProject, type ProjectBackup } from './storage';

export function BackupPanel({ project, disabled, restore, notify, onBusy }: { project: Project; disabled: boolean; restore: (p: Project) => boolean | void; notify: (s: string) => void; onBusy?: (busy: boolean) => void }) {
  const [backups, setBackups] = useState<ProjectBackup[] | null>(null), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const busyRef = useRef(false), latest = useRef({ project, disabled, restore, onBusy });
  latest.current = { project, disabled, restore, onBusy };
  const report = (message: string) => { setFeedback(message); notify(message); };
  function lock(value: boolean, projectOperation = false) { busyRef.current = value; setBusy(value); if (projectOperation) latest.current.onBusy?.(value); }
  async function open() {
    if (busyRef.current || latest.current.disabled) return;
    lock(true); setBackups([]); setFeedback('正在读取备份…');
    try { setBackups(await listProjectBackups()); setFeedback(''); }
    catch (e) { report(`备份读取失败：${e}`); }
    finally { lock(false); }
  }
  async function checkpoint() {
    if (busyRef.current || latest.current.disabled) return;
    lock(true, true); setFeedback('正在创建备份，请稍候…');
    try {
      await saveProject(latest.current.project, true);
      try { setBackups(await listProjectBackups()); }
      catch (e) { report(`备份已创建，但列表读取失败：${e}；请重新打开备份管理`); return; }
      report('已创建本机备份');
    }
    catch (e) { report(`备份失败：${e}`); }
    finally { lock(false, true); }
  }
  async function recover(b: ProjectBackup) {
    if (busyRef.current || latest.current.disabled) return;
    if (!confirm('恢复此备份？当前项目会先保留一份恢复前备份，也可使用撤销返回。')) return;
    lock(true, true); setFeedback('正在保存恢复前备份，请勿关闭页面…');
    try {
      await saveProject(latest.current.project, true);
      if (latest.current.restore(structuredClone(b.project)) === false) { report('恢复未应用，当前项目未替换，请检查后重试'); return; }
      setBackups(null); report('备份已恢复，恢复前项目已备份');
    } catch (e) { report(`恢复失败：${e}`); }
    finally { lock(false, true); }
  }
  return <><button disabled={disabled || busy} onClick={open}>本机备份</button>{backups && <ResourceDialog title="本机备份管理" compact closeDisabled={busy} close={() => setBackups(null)}><h2>本机历史备份</h2><p>{isLocalWork() ? '备份保存在项目文件夹的 backups 中；显示最近 50 份，未自动删除旧备份。请定期复制整个项目文件夹到其他磁盘。' : '自动备份至少间隔一分钟，最多保留五份，并受容量限制。清理浏览器数据会删除备份，请定期导出项目。'}</p><p aria-live="polite" aria-atomic="true" aria-label="备份操作反馈">{feedback}</p><button disabled={busy || disabled} onClick={checkpoint}>{busy ? '处理中…' : '创建备份'}</button>{backups.map(b => <div className="backup-entry" key={b.id}><span>{new Date(b.time).toLocaleString()} · {b.project.name}</span><button disabled={busy || disabled} aria-label={`恢复备份 ${b.id}`} onClick={() => recover(b)}>恢复</button></div>)}{!busy && !backups.length && !feedback.includes('失败') && <p>暂无历史备份。</p>}<button disabled={busy} onClick={() => setBackups(null)}>关闭备份</button></ResourceDialog>}</>;
}
