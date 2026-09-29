import { availableAsset } from './runtime';
import { SpritesheetEditor } from './SpritesheetEditor';
import { CategoryCreator } from './CategoryCreator';
import { ResourceDialog } from './ResourceDialog';
import { useState } from 'react';
import './resources.css';
import { actorSchema, type Project, type Shot } from '../../../packages/core';
import { builtinAssets, object3dSchema, type MediaAsset } from '../../../packages/core/media';
import type { BackgroundManifest } from '../../../packages/core/backgrounds';
import { importMedia } from './storage';
export function ResourceLibrary({ project, shot, edit, select, notify, manifest }: { manifest: BackgroundManifest | null; project: Project; shot: Shot; edit: (fn: (p: Project) => void) => void; select: (id: string) => void; notify: (s: string) => void }) {
  const [custom, setCustom] = useState(false), [category, setCategory] = useState<string>('backgrounds'), [search, setSearch] = useState('');
  const [makingSprite, setMakingSprite] = useState(false);
  const folder = custom ? project.resourceCategories.find(c => c.id === category) : undefined;
  const mediaCategory: MediaAsset['category'] = folder ? 'characters' : (['backgrounds', 'trees', 'characters', 'houses', 'audio', 'models'].includes(category) ? category as MediaAsset['category'] : 'characters');
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{ name: string; src: string; category: string; apply: () => Promise<void> | void } | null>(null);
  const [applying, setApplying] = useState(false);
  const choose = (item: NonNullable<typeof preview>) => { if (expanded) setPreview(item); else Promise.resolve(item.apply()).catch(e => notify(String(e))); };
  const assets = (custom ? project.assets : builtinAssets.filter(a => availableAsset(a.src))).filter(a => (folder ? a.customCategoryId === folder.id : a.category === category && !a.customCategoryId) && a.name.includes(search.trim()));
  const backgrounds = !custom && category === 'backgrounds' ? ([['protagonist_village', '村庄'], ['village_school', '村庄学校']] as const).filter(([, name]) => name.includes(search.trim())) : [];
  async function place(asset: MediaAsset) {
    if (asset.category === 'models') { if (shot.studio !== 'three') { notify('模型请放入 3D 镜头'); return; } edit(p => p.shots.find(s => s.id === shot.id)!.objects3d.push(object3dSchema.parse({ id: crypto.randomUUID(), name: asset.name, shape: 'model', assetId: asset.id }))); return; }
    if (asset.category === 'audio') { edit(p => { p.audioTracks.push({ id: crypto.randomUUID(), name: asset.name, assetId: asset.id, startFrame: 0, offsetFrame: 0, frames: 180, volume: 1, muted: false }); }); return; }
    if (shot.studio !== 'pixi') { notify('图片资源请放入 2D 镜头'); return; }
    if (asset.category === 'backgrounds') { if (!confirm('当前已有背景，是否替换？元素坐标将保留。')) return; edit(p => { const s = p.shots.find(s => s.id === shot.id)!; s.backgroundAssetId = asset.id; s.backgroundVersions = {}; s.blank = false; }); return; }
    const image = new Image(); image.src = asset.src; await image.decode();
    const id = crypto.randomUUID(), height = asset.category === 'characters' ? 119 : 250, width = height * (asset.frameRects?.[0]?.width ?? image.naturalWidth / asset.columns) / (asset.frameRects?.[0]?.height ?? image.naturalHeight / asset.rows);
    edit(p => { p.shots.find(s => s.id === shot.id)!.actors.push(actorSchema.parse({ id, name: asset.name, assetId: asset.id, width, height, start: { x: 768, y: 450 }, end: { x: 768, y: 450 } })); }); select(id);
  }
  const content = <section className="resources resource-library"><h2>资源库 · {assets.length + backgrounds.length} 项</h2>{!expanded && <button className="more-resources" onClick={() => { setPreview(null); setExpanded(true); }}>更多资源…</button>}<div className="button-row"><button className={!custom ? 'active' : ''} onClick={() => { setCustom(false); if (folder) setCategory('backgrounds'); }}>默认资源</button><button className={custom ? 'active' : ''} onClick={() => setCustom(true)}>自定义资源</button></div><label>资源分类<select value={category} onChange={e => setCategory(e.target.value as typeof category)}><option value="backgrounds">背景图</option><optgroup label="道具资源"><option value="trees">树木 / 花草</option><option value="characters">角色</option><option value="houses">房屋 / 道具</option><option value="models">3D 模型（GLB）</option></optgroup><optgroup label="其他资源"><option value="audio">音频</option></optgroup>{custom && <optgroup label="自定义分类">{project.resourceCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}</select></label>{custom && <><CategoryCreator project={project} edit={edit} created={setCategory}/><button className="more-resources" onClick={() => setMakingSprite(true)}>制作序列帧</button></>}<input aria-label="搜索资源" placeholder="搜索资源…" value={search} onChange={e => setSearch(e.target.value)}/>{custom && <label className="button">上传{category === 'audio' ? '音频' : category === 'models' ? '模型' : '图片'}<input aria-label="上传自定义资源" type="file" hidden accept={category === 'audio' ? 'audio/*' : category === 'models' ? '.glb' : 'image/png,image/jpeg,image/webp'} multiple onChange={async e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; try { const assets = await Promise.all(files.map(async f => ({ ...await importMedia(f, mediaCategory), ...(folder ? { customCategoryId: folder.id } : {}) }))); if (JSON.stringify(project.assets).length + JSON.stringify(assets).length > 100_000_000) throw new Error('项目资源总量不可超过 100MB'); edit(p => { p.assets.push(...assets); }); notify('资源已上传到本机；导出项目会包含资源'); } catch (e) { notify(String(e)); } }}/></label>}
    <div className="resource-items">
    {backgrounds.slice(0, expanded ? undefined : 6).map(([bg, name]) => <button className="asset" key={bg} title={name} disabled={shot.studio !== 'pixi'} onClick={() => choose({ name, category: 'backgrounds', src: manifest?.[bg + (shot.season === 'original' ? '' : '_' + shot.season)]?.default.url || '/art/' + bg + '.png', apply: () => {
      if (!shot.blank && (shot.backgroundAssetId || bg !== shot.background) && !confirm('当前场景已有背景图，是否替换？现有元素坐标将保留。')) return;
      edit(p => { const s = p.shots.find(s => s.id === shot.id)!; s.background = bg; s.backgroundAssetId = null; s.backgroundVersions = {}; s.blank = false; });
    } })}><img alt="" src={manifest?.[bg + (shot.season === 'original' ? '' : '_' + shot.season)]?.default.url || '/art/' + bg + '.png'}/><span>{name}</span></button>)}
    {assets.slice(0, expanded ? undefined : Math.max(0, 6 - backgrounds.length)).map(a => <div key={a.id}><button className="asset" title={a.name} onClick={() => choose({ name: a.name, src: a.src, category: a.category, apply: () => place(a) })}>{!['audio', 'models'].includes(a.category) && <img src={a.src} alt="" loading="lazy"/>}<span>{a.name}</span></button>{custom && a.category === 'characters' && !a.frameRects && <div className="sprite-settings">{(['columns', 'rows', 'fps'] as const).map(key => <label key={key}>{({ columns: '帧列', rows: '帧行', fps: '动画 FPS' })[key]}<input type="number" min="1" max={key === 'fps' ? 60 : 64} value={a[key]} onChange={e => edit(p => { p.assets.find(asset => asset.id === a.id)![key] = Number(e.target.value); })}/></label>)}</div>}{custom && <button onClick={() => { const used = project.shots.some(s => s.backgroundAssetId === a.id || Object.values(s.backgroundVersions).includes(a.id) || (s.actors.some(actor => actor.assetId === a.id) || s.objects3d.some(o => o.assetId === a.id))) || project.audioTracks.some(t => t.assetId === a.id) || project.sets.some(s => s.content.backgroundAssetId === a.id || (s.content.actors.some(actor => actor.assetId === a.id) || s.content.objects3d.some(o => o.assetId === a.id)) || Object.values(s.content.backgroundVersions).includes(a.id)); if (used) notify('资源仍被镜头、音轨或布景引用，不能删除'); else if (confirm('删除此自定义资源？可通过撤销恢复。')) edit(p => { p.assets = p.assets.filter(asset => asset.id !== a.id); }); }}>删除资源</button>}</div>)}
    </div>
    {!expanded && assets.length + backgrounds.length > 6 && <small>仅显示前 6 项，点击“更多资源”浏览全部。</small>}
    {!assets.length && !backgrounds.length && <p className="muted">暂无匹配资源{custom ? '，可上传添加。' : '。'}</p>}
    {!custom && category === 'backgrounds' && <p className="muted">点击替换背景；时节在右侧属性中调整。</p>}
  </section>;
  if (makingSprite) return <SpritesheetEditor project={project} edit={edit} close={() => setMakingSprite(false)} initialCategory={folder?.id ?? ''} saved={asset => { setCustom(true); setCategory(asset.customCategoryId!); setSearch(''); setPreview(null); notify('序列帧已保存到自定义资源'); }}/>;
  return expanded ? <ResourceDialog close={() => setExpanded(false)}><div className="resource-browser-body">{content}<section className="resource-preview" aria-label="资源大图预览">
    {preview ? <><h3>{preview.name}</h3>{!['audio', 'models'].includes(preview.category) ? <img src={preview.src} alt={preview.name}/> : preview.category === 'audio' ? <audio controls src={preview.src}/> : <p>GLB 模型，应用后在 3D 影棚查看。</p>}
    {preview.src.startsWith('/art/nl_asset_') && <p className="muted">原始建筑／道具图：保留原图底色，多件素材尚未拆分，应用时作为整图放置。</p>}
    <button disabled={applying || (preview.category === 'models' ? shot.studio !== 'three' : preview.category !== 'audio' && shot.studio !== 'pixi')} onClick={async () => { setApplying(true); try { await preview.apply(); } catch (e) { notify(String(e)); } finally { setApplying(false); } }}>{applying ? '正在应用…' : '应用到场景'}</button></> : <p>选择左侧缩略图查看大图</p>}
  </section></div></ResourceDialog> : content;
}
