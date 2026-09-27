import { effectSchema, type Shot, type Effect } from '../../../packages/core';
import { overlappingWaterIds, regionPoints } from '../../../packages/core/geometry';
export const effectNames = { rain: '降雨', snow: '降雪', fog: '雾气', water: '水流', cutout: '背景遮挡块' };
type Props = { shot: Shot; selected: string; select: (id: string) => void; change: (fn: (shot: Shot) => void) => void };
export function EnvironmentList({ shot, selected, select, change }: Props) {
  if (shot.studio !== 'pixi') return null;
  return <section className="environment-list"><h2>环境元素</h2>{shot.effects.map(e => <button key={e.id} className={`row ${selected === e.id ? 'active' : ''}`} onClick={() => select(e.id)}>{e.enabled ? '◉' : '○'} {e.name}</button>)}<label>添加环境元素<select aria-label="添加环境元素" value="" onChange={event => {
    const type = event.target.value as Effect['type']; if (!type) return;
    const id = crypto.randomUUID();
    change(s => { s.effects.push(effectSchema.parse({ id, type, name: `${effectNames[type]} ${s.effects.filter(e => e.type === type).length + 1}`, regions: [type === 'water' || type === 'cutout' ? { x: 500, y: 300, width: 400, height: 250 } : { x: 0, y: 0, width: 1536, height: 1024 }] })); }); select(id);
  }}><option value="">选择类型…</option>{Object.entries(effectNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></section>;
}
export function EnvironmentInspector({ shot, selected, select, change, draw }: Props & { draw?: (replace?: number) => void }) {
  if (shot.studio !== 'pixi') return null;
  const effect = shot.effects.find(e => e.id === selected);
  const update = (fn: (effect: Effect) => void) => change(s => fn(s.effects.find(e => e.id === selected)!));
  return <section className="environment-inspector"><h2>昼夜光照</h2><label>时段<select aria-label="时段" value={shot.lighting.time} onChange={e => change(s => { s.lighting.time = e.target.value as Shot['lighting']['time']; })}>{[['morning', '早晨'], ['noon', '中午'], ['evening', '傍晚'], ['night', '夜晚']].map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>{shot.lighting.time === 'night' && <>{(['ambient', 'moon'] as const).map(key => <label key={key}>{key === 'ambient' ? '夜间环境亮度' : '月光强度'}<input type="range" min="0" max="1" step="0.05" value={shot.lighting[key]} onChange={e => change(s => { s.lighting[key] = Number(e.target.value); })}/></label>)}</>}
    {effect && <><h2>{effectNames[effect.type]}属性</h2><label>环境名称<input value={effect.name} onChange={e => update(f => { f.name = e.target.value; })}/></label><label className="check"><input type="checkbox" checked={effect.enabled} onChange={e => update(f => { f.enabled = e.target.checked; })}/>启用环境元素</label><label>环境层级<input type="number" min="-100" max="100" value={effect.layer} onChange={e => update(f => { f.layer = Number(e.target.value); })}/></label>
    {effect.type !== 'cutout' && <>{(['intensity', 'speed', 'wind'] as const).map(key => <label key={key}>{({ intensity: '强度', speed: '速度', wind: '额外水平风 / 水流方向' })[key]} · {effect[key].toFixed(2)}<input aria-label={key} type="range" min={key === 'wind' ? -1 : 0} max={key === 'speed' ? 4 : 1} step="0.05" value={effect[key]} onChange={e => update(f => { f[key] = Number(e.target.value); })}/></label>)}{effect.type === 'rain' && <label>雨水密度（数量，与强度分开） · {effect.density.toFixed(2)}<input aria-label="雨水密度" type="range" min="0" max="1" step="0.05" value={effect.density} onChange={e => update(f => { f.density = Number(e.target.value); })}/></label>}<label>随机种子<input type="number" min="0" max="1000000" value={effect.seed} onChange={e => update(f => { f.seed = Number(e.target.value); })}/></label></>}
    {effect.type === 'rain' && <label className="check"><input type="checkbox" checked={effect.splashes} onChange={e => update(f => { f.splashes = e.target.checked; })}/>雨滴涟漪</label>}
    <label className="check"><input type="checkbox" checked={effect.collisionEnabled} onChange={e => update(f => { f.collisionEnabled = e.target.checked; })}/>区域启用碰撞</label>
    {effect.type === 'water' && <><p className="muted">使用上方「水流导线」逐点绘制，Enter 完成。多条导线按距离加权合成流向，越近影响越大。</p>{overlappingWaterIds(shot.effects).includes(effect.id) && <p role="alert">水域不能重叠。共边可以，面积重叠时禁止保存和播放。</p>}{effect.flowLines.map((line, i) => <div key={i}>导线 {i + 1} · {line.length} 点<button onClick={() => update(f => { f.flowLines[i].reverse(); })}>反向</button><button onClick={() => update(f => { f.flowLines.splice(i, 1); })}>删除导线</button></div>)}</>}
    <label className="check"><input type="checkbox" checked={effect.sortY !== null} onChange={e => update(f => { f.sortY = e.target.checked ? f.regions[0].y : null; })}/>自定义遮挡横线</label>{effect.sortY !== null && <label>遮挡线 Y<input type="number" min="0" max="1024" value={effect.sortY} onChange={e => update(f => { f.sortY = Number(e.target.value); })}/></label>}
    <p className="muted">层级优先；同层按脚底 / 落地点 Y 排序。房屋要遮挡雨滴，需要添加覆盖房屋的背景遮挡块。横线仅选中时显示，不进入导出。</p>
    {effect.regions.map((r, i) => <fieldset className="region-fields" key={i}><legend>范围 {i + 1}（{r.points ? `${r.points.length} 点多边形` : '矩形'}）</legend>{effect.type === 'rain' && <label className="check"><input aria-label={`范围${i + 1}水花`} type="checkbox" checked={r.splashes ?? effect.splashes} onChange={e => update(f => { f.regions[i].splashes = e.target.checked; })}/>此范围水花</label>}{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{({ x: 'X', y: 'Y', width: '宽', height: '高' })[key]}<input aria-label={`范围${i + 1}-${key}`} type="number" disabled={!!r.points} value={r[key]} onChange={e => update(f => { f.regions[i][key] = Number(e.target.value); })}/></label>)}{draw && <button onClick={() => draw(i)}>重绘范围 {i + 1}</button>}<button disabled={effect.regions.length === 1} onClick={() => update(f => { f.regions.splice(i, 1); })}>移除此范围</button></fieldset>)}
    {draw && <button disabled={effect.regions.length >= 12} onClick={() => draw()}>绘制新增多边形</button>}
    <button disabled={effect.regions.length >= 12} onClick={() => update(f => { f.regions.push({ x: 100, y: 100, width: 300, height: 200 }); })}>添加范围</button><button onClick={() => { change(s => { s.effects = s.effects.filter(e => e.id !== selected); }); select(''); }}>删除环境元素</button></>}
  </section>;
}
export function WaterOverlapOverlay({ shot }: { shot: Shot }) {
  if (shot.studio !== 'pixi') return null;
  const ids = new Set(overlappingWaterIds(shot.effects));
  if (!ids.size) return null;
  const regions = shot.effects.filter(effect => ids.has(effect.id)).flatMap(effect => effect.regions);
  return <svg className="selection-overlay overlap-overlay" viewBox="0 0 1280 720" aria-label="重叠水域">{regions.map((r, i) => <polygon key={i} points={regionPoints(r).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/>)}</svg>;
}
export function SelectionOverlay({ shot, selected }: Pick<Props, 'shot' | 'selected'>) {
  const effect = shot.effects.find(e => e.id === selected);
  if (!effect || shot.studio !== 'pixi') return null;
  return <svg className="selection-overlay" viewBox="0 0 1280 720" aria-label="选中范围辅助线">{effect.regions.map((r, i) => <polygon key={i} points={regionPoints(r).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/>)}{effect.sortY !== null && <line x1="100" x2="1180" y1={720 - effect.sortY * 720 / 1024} y2={720 - effect.sortY * 720 / 1024}/>}</svg>;
}
