import { seasons, type Shot } from '../../../packages/core';
import { backgroundKey, qualities, resolveBackground, type BackgroundManifest, type Quality } from '../../../packages/core/backgrounds';
import { builtinAssets, type MediaAsset } from '../../../packages/core/media';
export const seasonNames = ['原图', '初春', '仲春', '暮春', '初夏', '仲夏', '暮夏', '初秋', '仲秋', '暮秋', '初冬', '仲冬', '暮冬'];
export function BackgroundPanel({ shot, change, manifest, assets = [] }: { shot: Shot; change: (fn: (s: Shot) => void) => void; manifest: BackgroundManifest | null; assets?: MediaAsset[] }) {
  assets = [...builtinAssets, ...assets];
  if (shot.studio !== 'pixi') return null;
  if (shot.backgroundAssetId) return <section><h2>自定义背景</h2><img className="season-preview" src={assets.find(a => a.id === shot.backgroundAssetId)?.src}/>{(['x2', 'x4'] as const).map(q => <label key={q}>{q} 图片<select value={shot.backgroundVersions[q] ?? ''} onChange={e => change(s => { if (e.target.value) s.backgroundVersions[q] = e.target.value; else delete s.backgroundVersions[q]; })}><option value="">未配置</option>{assets.filter(a => a.category === 'backgrounds').map(a => <option key={a.id} value={a.id}>{a.name} · {a.width}×{a.height}</option>)}</select></label>)}<button onClick={() => change(s => { s.backgroundAssetId = null; s.backgroundVersions = {}; })}>恢复内置背景</button></section>;
  const asset = manifest?.[backgroundKey(shot)]?.default;
  return <section className="background-panel"><h2>背景时节</h2><label>时节<select aria-label="背景时节" value={shot.season} onChange={e => change(s => { s.season = e.target.value as Shot['season']; })}>{seasons.map((s, i) => <option key={s} value={s} disabled={!!manifest && !manifest[backgroundKey({ ...shot, season: s })]}>{seasonNames[i]}</option>)}</select></label><label>时节进度 · {seasonNames[seasons.indexOf(shot.season)]}<input aria-label="时节进度" type="range" min="0" max="12" step="1" value={seasons.indexOf(shot.season)} onChange={e => change(s => { s.season = seasons[Number(e.target.value)]; })}/></label>{asset && <img className="season-preview" src={asset.url} alt={`${seasonNames[seasons.indexOf(shot.season)]}背景预览`}/>}<p className="muted">时节随镜头保存；滑杆切换静态时节图片，不自动随播放时间推进。昼夜光照独立设置。</p></section>;
}
export function ResolutionPicker({ shot, manifest, quality, setQuality, assets = [] }: { shot: Shot; manifest: BackgroundManifest | null; quality: Quality; setQuality: (q: Quality) => void; assets?: MediaAsset[] }) {
  assets = [...builtinAssets, ...assets];
  if (shot.studio !== 'pixi' || !manifest) return null;
  const variants = shot.backgroundAssetId ? Object.fromEntries(qualities.map(q => { const a = assets.find(a => a.id === (q === 'default' ? shot.backgroundAssetId : shot.backgroundVersions[q])); return [q, a && { width: a.width, height: a.height, url: a.src }]; })) : manifest[backgroundKey(shot)];
  if (!variants) return <span>当前背景缺失</span>;
  const asset = resolveBackground(manifest, shot, quality, assets);
  return <label className="resolution-picker" title="版本标签不代表实际倍率；坐标按真实图片尺寸映射">背景分辨率<select aria-label="背景分辨率" value={asset.quality} onChange={e => setQuality(e.target.value as Quality)}>{qualities.map(q => <option key={q} value={q} disabled={!variants?.[q]}>{q === 'default' ? '默认' : q}{variants?.[q] ? ` · ${variants[q]!.width}×${variants[q]!.height}` : ' · 无图片'}</option>)}</select></label>;
}
