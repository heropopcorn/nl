import { useSyncExternalStore } from 'react';
import { isLocalWork } from './runtime';
import { previewSaveState, subscribePreviewSave } from './storage';
import { workspaceState } from './workspace-storage';
const subscribeWorkspace = (notify: () => void) => { window.addEventListener('workspace-state', notify); return () => window.removeEventListener('workspace-state', notify); };
export function SaveIndicator({ blocked, ready, retry }: { blocked: boolean; ready: boolean; retry: () => void }) {
  const preview = useSyncExternalStore(subscribePreviewSave, previewSaveState);
  const workspace = useSyncExternalStore(subscribeWorkspace, workspaceState);
  const local = isLocalWork(), error = local ? workspace.error : preview.error, dirty = local ? workspace.dirty : preview.dirty;
  const label = !ready ? '项目加载中' : blocked ? '未保存 · 水域重叠' : error ? '保存失败 · 请重试或导出备份' : dirty ? '修改尚未保存' : local ? '已保存到磁盘' : '已保存到浏览器';
  return <div className={`save-indicator ${error || blocked ? 'save-error' : ''}`} aria-label="项目保存状态" title={error || label}>
    <span>{label}</span><button disabled={!ready || blocked || (!local && preview.saving)} onClick={retry}>{error ? '重试保存' : '保存项目'}</button>
  </div>;
}
