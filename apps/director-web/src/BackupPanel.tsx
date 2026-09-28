import { useState } from 'react';
import type { Project } from '../../../packages/core';
import { listProjectBackups, saveProject, type ProjectBackup } from './storage';

export function BackupPanel({ project, disabled, restore, notify }: { project: Project; disabled: boolean; restore: (p: Project) => void; notify: (s: string) => void }) {
  const [backups, setBackups] = useState<ProjectBackup[] | null>(null), [busy, setBusy] = useState(false);
  async function open() { try { setBackups(await listProjectBackups()); } catch (e) { notify(`备份读取失败：${e}`); } }
  async function checkpoint() { setBusy(true); try { await saveProject(project, true); await open(); notify('已创建本机备份'); } catch (e) { notify(`备份失败：${e}`); } finally { setBusy(false); } }
  async function recover(b: ProjectBackup) {
    if (!confirm('恢复此备份？当前项目会先保留一份恢复前备份，也可使用撤销返回。')) return;
    setBusy(true);
    try { await saveProject(project, true); restore(structuredClone(b.project)); setBackups(null); notify('备份已恢复，恢复前项目已备份'); } catch (e) { notify(`恢复失败：${e}`); } finally { setBusy(false); }
  }
  return <><button disabled={disabled} onClick={open}>本机备份</button>{backups && <section role="dialog" aria-label="本机备份管理" className="legacy-import-dialog"><h2>本机历史备份</h2><p>自动备份至少间隔一分钟，最多保留五份，并受容量限制。清理浏览器数据会删除备份，请定期导出项目。</p><button disabled={busy || disabled} onClick={checkpoint}>创建备份</button>{backups.map(b => <div key={b.id}><span>{new Date(b.time).toLocaleString()} · {b.project.name}</span><button disabled={busy || disabled} aria-label={`恢复备份 ${b.id}`} onClick={() => recover(b)}>恢复</button></div>)}{!backups.length && <p>暂无历史备份。</p>}<button disabled={busy} onClick={() => setBackups(null)}>关闭备份</button></section>}</>;
}
