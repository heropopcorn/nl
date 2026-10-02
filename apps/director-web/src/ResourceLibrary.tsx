import { NumberField } from './NumberField';
import { MobileDrawer } from './ResponsiveLayout';
import { availableAsset, isLocalWork } from './runtime';
import { SpritesheetEditor } from './SpritesheetEditor';
import { CategoryCreator } from './CategoryCreator';
import { ResourceDialog } from './ResourceDialog';
import { useEffect, useRef, useState } from 'react';
import './resources.css';
import './dialog-drawers.css';
import { actorSchema, type Project, type Shot } from '../../../packages/core';
import { builtinAssets, object3dSchema, type MediaAsset } from '../../../packages/core/media';
import type { BackgroundManifest } from '../../../packages/core/backgrounds';
import { importMedia } from './storage';
type ResourceChoice = { kind: 'background'; id: 'protagonist_village' | 'village_school' } | { kind: 'asset'; id: string };
const backgroundNames = { protagonist_village: '村庄', village_school: '村庄学校' };
export function ResourceLibrary({ project, shot, edit, select, notify, manifest }: { manifest: BackgroundManifest | null; project: Project; shot: Shot; edit: (fn: (p: Project) => void) => boolean | void; select: (id: string) => void; notify: (s: string) => void }) {
  const [custom, setCustom] = useState(false), [category, setCategory] = useState<string>('backgrounds'), [search, setSearch] = useState('');
  const [makingSprite, setMakingSprite] = useState(false);
  const folder = custom ? project.resourceCategories.find(c => c.id === category) : undefined;
  const mediaCategory: MediaAsset['category'] = folder ? 'characters' : (['backgrounds', 'trees', 'characters', 'houses', 'audio', 'models'].includes(category) ? category as MediaAsset['category'] : 'characters');
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [choice, setPreview] = useState<ResourceChoice | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const busy = useRef(false), latest = useRef({ project, shot, select }); latest.current = { project, shot, select };
  const report = (text: string) => { setMessage(text); notify(text); };
  const findAsset = (id: string, p = project) => p.assets.find(a => a.id === id) ?? builtinAssets.find(a => a.id === id);
  const backgroundSrc = (id: string) => manifest?.[id + (shot.season === 'original' ? '' : '_' + shot.season)]?.default.url || '/art/' + id + '.png';
  const preview = choice?.kind === 'background' ? { name: backgroundNames[choice.id], src: backgroundSrc(choice.id), category: 'backgrounds' } : choice ? findAsset(choice.id) : null;
  const matches = (name: string) => name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const assets = (custom ? project.assets : builtinAssets.filter(a => availableAsset(a.src))).filter(a => (folder ? a.customCategoryId === folder.id : a.category === category && !a.customCategoryId) && matches(a.name));
  const backgrounds = !custom && category === 'backgrounds' ? (Object.entries(backgroundNames) as [keyof typeof backgroundNames, string][]).filter(([, name]) => matches(name)) : [];
  useEffect(() => {
    if (!applying) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [applying]);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setApplying(true); setMessage('正在处理…');
    try { await action(); } catch (error) { report('操作失败：' + (error instanceof Error ? error.message : String(error))); }
    finally { busy.current = false; setApplying(false); }
  }
  function commit(change: (p: Project) => void, success: string) {
    if (edit(change) === false) { setMessage('未应用：请检查参数或当前操作状态，详情见编辑器底部提示'); return false; }
    report(success); return true;
  }
  const choose = (item: ResourceChoice) => { setMessage(''); if (expanded) { setPreview(item); setListOpen(false); } else void run(() => place(item)); };
  async function place(item: ResourceChoice) {
    const target = latest.current.shot, asset = item.kind === 'asset' ? findAsset(item.id, latest.current.project) : undefined;
    if (item.kind === 'asset' && !asset) throw new Error('此资源已删除，请重新选择');
    const category = asset?.category ?? 'backgrounds', name = asset?.name ?? backgroundNames[(item as { id: keyof typeof backgroundNames }).id];
    if (category === 'models') {
      if (target.studio !== 'three') throw new Error('模型请放入 3D 布景');
      const id = crypto.randomUUID();
      if (commit(p => p.shots.find(s => s.id === target.id)!.objects3d.push(object3dSchema.parse({ id, name, shape: 'model', assetId: item.id })), '已添加模型：' + name)) select(id);
      return;
    }
    if (category === 'audio') { commit(p => { p.audioTracks.push({ id: crypto.randomUUID(), name, assetId: item.id, startFrame: 0, offsetFrame: 0, frames: 180, volume: 1, muted: false }); }, '已添加音轨：' + name + '（当前场景编辑模式不播放音轨）'); return; }
    if (target.studio !== 'pixi') throw new Error('图片资源请放入 2D 布景');
    if (category === 'backgrounds') {
      if (!target.blank && (item.kind === 'background' ? !target.backgroundAssetId && target.background === item.id : target.backgroundAssetId === item.id)) { report('当前已使用此背景'); return; }
      if (!target.blank && !confirm('当前场景已有背景图，是否替换？现有元素坐标将保留。')) { report('已取消替换背景'); return; }
      commit(p => {
        const s = p.shots.find(s => s.id === target.id)!;
        if (item.kind === 'background') { s.background = item.id; s.backgroundAssetId = null; } else s.backgroundAssetId = item.id;
        s.backgroundVersions = {}; s.blank = false;
      }, '已应用背景：' + name); return;
    }
    const image = new Image(); image.src = asset!.src; await image.decode();
    if (latest.current.shot.id !== target.id) throw new Error('布景已切换，未添加资源；请在当前布景重新应用');
    const currentAsset = findAsset(item.id, latest.current.project);
    if (!currentAsset || currentAsset.src !== asset!.src) throw new Error('资源已改变，请重新选择');
    const id = crypto.randomUUID(), height = currentAsset.category === 'characters' ? 119 : 250;
    const width = height * (currentAsset.frameRects?.[0]?.width ?? image.naturalWidth / currentAsset.columns) / (currentAsset.frameRects?.[0]?.height ?? image.naturalHeight / currentAsset.rows);
    if (commit(p => {
      const s = p.shots.find(s => s.id === target.id);
      if (!s || s.studio !== 'pixi') throw new Error('布景已改变，请重新应用');
      s.actors.push(actorSchema.parse({ id, name: currentAsset.name, assetId: item.id, width, height, start: { x: 768, y: 450 }, end: { x: 768, y: 450 } }));
    }, '已添加元素：' + currentAsset.name)) latest.current.select(id);
  }
  async function upload(files: File[]) {
    if (!files.length) { setMessage(''); return; }
    const imported: MediaAsset[] = [];
    if (latest.current.project.assets.length + files.length > 200) throw new Error('项目最多 200 个自定义资源，请减少上传数量');
    let bytes = JSON.stringify(latest.current.project.assets).length;
    if (!isLocalWork() && bytes + files.reduce((sum, file) => sum + Math.ceil(file.size / 3) * 4, 0) > 100_000_000) throw new Error('本次上传后将超过 100MB 浏览器项目容量，请减少文件或使用本地工作模式');
    // Decode one file at a time to avoid a memory spike on phones.
    for (const file of files) {
      const asset = { ...await importMedia(file, mediaCategory), ...(folder ? { customCategoryId: folder.id } : {}) };
      bytes += JSON.stringify(asset).length;
      if (bytes > 100_000_000) throw new Error('项目资源总量不可超过 100MB，本批资源未加入项目');
      imported.push(asset); setMessage(`正在上传 ${imported.length} / ${files.length}…`);
    }
    if (commit(p => {
      if (folder && !p.resourceCategories.some(c => c.id === folder.id)) throw new Error('目标分类已删除，请重新上传');
      if (JSON.stringify(p.assets).length + JSON.stringify(imported).length > 100_000_000) throw new Error('项目资源总量不可超过 100MB');
      p.assets.push(...imported);
    }, `已上传 ${imported.length} 个资源；点击缩略图可应用到场景`)) { setCustom(true); setCategory(category); setSearch(''); }
  }
  const content = <section className="resources resource-library"><h2>资源库 · {assets.length + backgrounds.length} 项</h2>{!expanded && <button className="more-resources" onClick={() => { setPreview(null); setListOpen(true); setExpanded(true); }}>更多资源…</button>}<div className="button-row"><button className={!custom ? 'active' : ''} onClick={() => { setCustom(false); if (folder) setCategory('backgrounds'); }}>默认资源</button><button className={custom ? 'active' : ''} onClick={() => setCustom(true)}>自定义资源</button></div><label>资源分类<select value={category} onChange={e => setCategory(e.target.value as typeof category)}><option value="backgrounds">背景图</option><optgroup label="道具资源"><option value="trees">树木 / 花草</option><option value="characters">角色</option><option value="houses">房屋 / 道具</option><option value="models">3D 模型（GLB）</option></optgroup><optgroup label="其他资源"><option value="audio">音频</option></optgroup>{custom && <optgroup label="自定义分类">{project.resourceCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}</select></label>{custom && <><CategoryCreator project={project} edit={edit} created={setCategory}/><button className="more-resources" disabled={applying} onClick={() => setMakingSprite(true)}>制作序列帧</button></>}<input aria-label="搜索资源" placeholder="搜索资源…" value={search} onChange={e => setSearch(e.target.value)}/>{custom && <label className="button">上传{category === 'audio' ? '音频' : category === 'models' ? '模型' : '图片'}<input aria-label="上传自定义资源" type="file" hidden accept={category === 'audio' ? 'audio/*' : category === 'models' ? '.glb' : 'image/png,image/jpeg,image/webp'} multiple disabled={applying} onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void run(() => upload(files)); }}/></label>}
    {!expanded && message && <p className="resource-feedback" aria-live="polite">{message}</p>}
    {expanded && message && <p className="drawer-feedback" aria-live="polite">{message}</p>}
    <div className="resource-items">
    {backgrounds.slice(0, expanded ? undefined : 6).map(([bg, name]) => <button className="asset" key={bg} title={name} disabled={applying || (!expanded && shot.studio !== 'pixi')} onClick={() => choose({ kind: 'background', id: bg })}><img alt="" src={backgroundSrc(bg)}/><span>{name}</span></button>)}
    {assets.slice(0, expanded ? undefined : Math.max(0, 6 - backgrounds.length)).map(a => <div key={a.id}><button className="asset" title={a.name} disabled={applying} onClick={() => choose({ kind: 'asset', id: a.id })}>{!['audio', 'models'].includes(a.category) && <img src={a.src} alt="" loading="lazy"/>}<span>{a.name}</span></button>{custom && a.category === 'characters' && !a.frameRects && <div className="sprite-settings">{(['columns', 'rows', 'fps'] as const).map(key => <label key={key}>{({ columns: '帧列', rows: '帧行', fps: '动画 FPS' })[key]}<NumberField  min="1" max={key === 'fps' ? 60 : 64} value={a[key]} onValueChange={value => edit(p => { p.assets.find(asset => asset.id === a.id)![key] = value; })}/></label>)}</div>}{custom && <button disabled={applying} onClick={() => { const used = project.shots.some(s => s.backgroundAssetId === a.id || Object.values(s.backgroundVersions).includes(a.id) || (s.actors.some(actor => actor.assetId === a.id) || s.objects3d.some(o => o.assetId === a.id))) || project.audioTracks.some(t => t.assetId === a.id) || project.sets.some(s => s.content.backgroundAssetId === a.id || (s.content.actors.some(actor => actor.assetId === a.id) || s.content.objects3d.some(o => o.assetId === a.id)) || Object.values(s.content.backgroundVersions).includes(a.id)); if (used) report('资源仍被镜头、音轨或布景引用，不能删除'); else if (confirm('删除此自定义资源？可通过撤销恢复。')) { if (commit(p => { p.assets = p.assets.filter(asset => asset.id !== a.id); }, '资源已删除，可撤销恢复') && choice?.id === a.id) setPreview(null); } }}>删除资源</button>}</div>)}
    </div>
    {!expanded && assets.length + backgrounds.length > 6 && <small>仅显示前 6 项，点击“更多资源”浏览全部。</small>}
    {!assets.length && !backgrounds.length && <p className="muted">暂无匹配资源{custom ? '，可上传添加。' : '。'}</p>}
    {!custom && category === 'backgrounds' && <p className="muted">点击替换背景；时节在右侧属性中调整。</p>}
  </section>;
  if (makingSprite) return <SpritesheetEditor project={project} edit={edit} close={() => setMakingSprite(false)} initialCategory={folder?.id ?? ''} saved={asset => { setCustom(true); setCategory(asset.customCategoryId!); setSearch(''); setPreview(null); notify('序列帧已保存到自定义资源'); }}/>;
  return expanded ? <ResourceDialog closeDisabled={applying} close={() => setExpanded(false)}><nav className="mobile-sections drawer-triggers" aria-label="资源浏览分区"><button aria-expanded={listOpen} aria-controls="resource-list-drawer" onClick={() => setListOpen(!listOpen)}>资源列表</button></nav><div className="resource-browser-body resource-drawer-layout"><MobileDrawer id="resource-list-drawer" title="资源列表" side="left" open={listOpen} onClose={() => setListOpen(false)} className="resource-list-drawer">{content}</MobileDrawer><section className="resource-preview" aria-label="资源大图预览">
    {preview ? <><h3>{preview.name}</h3>{!['audio', 'models'].includes(preview.category) ? <img src={preview.src} alt={preview.name}/> : preview.category === 'audio' ? <audio controls src={preview.src}/> : <p>GLB 模型，应用后在 3D 影棚查看。</p>}
    {preview.src.startsWith('/art/nl_asset_') && <p className="muted">原始建筑／道具图：保留原图底色，多件素材尚未拆分，应用时作为整图放置。</p>}
    <button disabled={applying || (preview.category === 'models' ? shot.studio !== 'three' : preview.category !== 'audio' && shot.studio !== 'pixi')} onClick={() => { if (choice) void run(() => place(choice)); }}>{applying ? '正在应用…' : '应用到场景'}</button></> : <><p>选择资源列表中的缩略图查看大图</p><button className="drawer-inline-trigger" aria-expanded={listOpen} aria-controls="resource-list-drawer" onClick={() => setListOpen(true)}>选择资源</button></>}
  </section></div>{message && <p className="resource-feedback" aria-live="polite">{message}</p>}</ResourceDialog> : content;
}
