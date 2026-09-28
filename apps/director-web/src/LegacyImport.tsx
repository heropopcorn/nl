import { useRef, useState } from 'react';
import { projectSchema, type Project } from '../../../packages/core';
import { appendLegacyScenes, knownLegacyPreset, matchLegacyFile, migrateLegacyScene, normalizeLegacyScene } from '../../../packages/core/legacy';
import { importMedia } from './storage';

type Source = { data: any; raw: any; path: string };
type Binding = { key: string; label: string; fileIndex: string; category: Project['assets'][number]['category']; assetId?: string };
type Pending = { files: File[]; sources: Source[]; bindings: Binding[]; index?: any };

export function LegacyImport({ edit, notify, project, disabled = false }: { project: Project; disabled?: boolean; edit: (fn: (p: Project) => void) => void; notify: (s: string) => void }) {
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false);
  const latest = useRef({ project, edit, disabled }); latest.current = { project, edit, disabled };
  const path = (file: File) => file.webkitRelativePath || file.name;
  async function inspect(files: File[]) {
    try {
      if (files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) throw new Error('单次导入最多 100MB');
      const jsons = await Promise.all(files.filter(f => /\.json$/i.test(f.name)).map(async file => ({ path: path(file), raw: JSON.parse(await file.text()) })));
      const sources = jsons.map(j => ({ ...j, data: normalizeLegacyScene(j.raw) })).filter(j => j.data.schema_version === 2 && j.data.scene_id);
      if (!sources.length) throw new Error('未找到 Godot v2 场景或 v1 scene_layout.json');
      const indices = jsons.filter(j => Array.isArray(j.raw.chapters) && Array.isArray(j.raw.scenes));
      if (indices.length > 1) throw new Error('存在多个章节索引，请按工程分批导入');
      const bindings: Binding[] = [], paths = files.map(path);
      const add = (key: string, label: string, owner: string, reference: string, category: Binding['category'], assetId?: string) => {
        const match = matchLegacyFile(paths, owner, reference);
        bindings.push({ key, label, fileIndex: match === null ? '' : String(match), category, assetId });
      };
      for (const index of jsons.filter(j => Array.isArray(j.raw.assets))) for (const item of index.raw.assets) {
        if (bindings.some(b => b.assetId === item.id)) throw new Error(`重复的资源 ID：${item.id}`);
        add(`asset:${item.id}`, `资源 ${item.name || item.id}`, index.path, item.file, item.category, item.id);
      }
      for (const [i, source] of sources.entries()) {
        const bg = source.data.background;
        if (bg?.source !== 'blank' && (bg?.source !== 'preset' || !knownLegacyPreset(String(bg.preset_id)))) add(`background:${i}`, `${source.data.name} · 背景`, source.path, bg?.file || 'background.png', 'backgrounds');
      }
      setPending({ files, sources, bindings, index: indices[0]?.raw });
    } catch (error) { notify(`导入失败：${String(error)}`); }
  }
  async function apply() {
    if (!pending || disabled || busy) return;
    setBusy(true);
    try {
      const assets: Project['assets'] = [], customIds: Record<string, string> = {}, bound = new Map<string, string>();
      for (const binding of pending.bindings) {
        if (binding.fileIndex === '') throw new Error(`请指定 ${binding.label} 的图片`);
        const asset = await importMedia(pending.files[Number(binding.fileIndex)], binding.category);
        assets.push(asset); bound.set(binding.key, asset.id);
        if (binding.assetId) customIds[binding.assetId] = asset.id;
      }
      const converted = pending.sources.map((s, i) => ({ sourceId: s.data.scene_id, ...migrateLegacyScene(s.raw, bound.get(`background:${i}`) ?? null, customIds, assets) }));
      const message = converted.flatMap(r => r.warnings).join('\n');
      if (message && !confirm(`导入差异（原始数据将保留在项目中）：\n${message}\n是否继续？`)) return;
      if (latest.current.disabled) throw new Error('请暂停播放或等待导出后再导入');
      const next = structuredClone(latest.current.project); next.assets.push(...assets); appendLegacyScenes(next, converted, pending.index);
      projectSchema.parse(next);
      if (JSON.stringify(next.assets).length > 140_000_000) throw new Error('项目资源过大，请拆分工程');
      latest.current.edit(p => { p.assets.push(...assets); appendLegacyScenes(p, converted, pending.index); projectSchema.parse(p); });
      setPending(null); notify(`已导入 ${converted.length} 个旧场景，原始文件未修改；请复核导入差异`);
    } catch (error) { notify(`导入失败：${String(error)}`); }
    finally { setBusy(false); }
  }
  const choose = (files: FileList | null) => { if (files) void inspect([...files]); };
  return <><label className="button">导入 Godot 场景<input aria-label="导入旧场景" type="file" multiple accept=".json,.png,.jpg,.jpeg,.webp" hidden disabled={disabled || busy} onChange={e => { choose(e.target.files); e.target.value = ''; }}/></label>
    {pending && <section className="legacy-import-dialog" role="dialog" aria-label="旧场景导入确认"><h2>确认导入 {pending.sources.length} 个场景</h2><p>可选择整个旧工程目录以保留同名文件的路径，或手动为每个场景指定图片。不会覆盖现有场景。</p>
      <label className="button">重新选择工程目录<input aria-label="选择旧工程目录" type="file" multiple hidden disabled={busy} {...{ webkitdirectory: '' }} onChange={e => { choose(e.target.files); e.target.value = ''; }}/></label>
      {pending.bindings.map((b, i) => <label key={b.key}>{b.label}<select aria-label={b.label} value={b.fileIndex} disabled={busy} onChange={e => setPending({ ...pending, bindings: pending.bindings.map((v, n) => n === i ? { ...v, fileIndex: e.target.value } : v) })}><option value="">请选择图片（缺失或同名不明确）</option>{pending.files.map((f, n) => /\.(png|jpe?g|webp)$/i.test(f.name) && <option key={n} value={n}>{path(f)} · 文件 {n + 1}</option>)}</select></label>)}
      <p>{pending.index ? '已找到章节索引，将按原章节和顺序导入。' : '未提供章节索引，场景将归入新建的导入章节。'}</p>
      <button disabled={busy || disabled || pending.bindings.some(b => b.fileIndex === '')} onClick={apply}>确认导入旧场景</button><button disabled={busy} onClick={() => setPending(null)}>取消导入</button>
    </section>}</>;
}
