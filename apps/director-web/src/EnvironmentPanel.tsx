import { RegionFields } from './RegionFields';
import { effectSchema, type Shot, type Effect } from '../../../packages/core';
import { overlappingWaterIds, regionPoints } from '../../../packages/core/geometry';
import { actorPosition } from '../../../packages/core/routes';
export const effectNames = { rain: '降雨', snow: '降雪', fog: '雾气', water: '水流', cutout: '背景遮挡块', lightning: '雷电' };
export function CollisionOverlay({ shot, frame }: { shot: Shot; frame: number }) {
  if (shot.studio !== 'pixi') return null;
  return <svg className="selection-overlay collision-overlay" viewBox="0 0 1280 720" aria-label="碰撞调试叠层"><text x="112" y="24" fill="#ffae54" stroke="none">F3 碰撞调试 · {shot.collisionEnabled ? '全局开启' : '全局关闭'} · 橙色为区域，圆点为角色脚底</text>{shot.effects.filter(e => e.enabled && e.collisionEnabled).flatMap(e => e.regions.map((r, i) => <polygon key={`${e.id}:${i}`} opacity={shot.collisionEnabled ? 1 : 0.3} points={regionPoints(r).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/>))}{shot.actors.filter(a => a.enabled).map(a => { const p = actorPosition(a, shot, frame); return <circle key={a.id} cx={100 + p.x * 720 / 1024} cy={720 - p.y * 720 / 1024} r="5"/>; })}</svg>;
}
type Props = { activeRegion: number | null; selectRegion: (i: number | null) => void; shot: Shot; selected: string; select: (id: string) => void; change: (fn: (shot: Shot) => void) => void };
export function EnvironmentList({ shot, selected, select, change, showAllRegions, setShowAllRegions }: Props & { showAllRegions: boolean; setShowAllRegions: (value: boolean) => void }) {
  if (shot.studio !== 'pixi') return null;
  return <section className="environment-list"><h2>环境元素</h2><label className="check"><input type="checkbox" checked={showAllRegions} onChange={e => setShowAllRegions(e.target.checked)}/>显示所有元素区域</label>{shot.effects.map(e => <div className="environment-row" key={e.id}><button className={`row ${selected === e.id ? 'active' : ''}`} onClick={() => select(e.id)}>{e.enabled ? '◉' : '○'} {e.name}</button><button aria-label={`${e.enabled ? '隐藏' : '显示'}环境元素 ${e.name}`} onClick={() => change(s => { const f = s.effects.find(f => f.id === e.id)!; f.enabled = !f.enabled; })}>{e.enabled ? '隐藏' : '显示'}</button><button className="danger" aria-label={`删除环境元素 ${e.name}`} onClick={() => { change(s => { s.effects = s.effects.filter(f => f.id !== e.id); }); if (selected === e.id) select(''); }}>删除</button></div>)}<label>添加环境元素<select aria-label="添加环境元素" value="" onChange={event => {
    const type = event.target.value as Effect['type']; if (!type) return;
    const id = crypto.randomUUID();
    change(s => { s.effects.push(effectSchema.parse({ id, type, name: `${effectNames[type]} ${s.effects.filter(e => e.type === type).length + 1}`, regions: type === 'lightning' ? [] : [type === 'water' || type === 'cutout' ? { x: 500, y: 300, width: 400, height: 250 } : { x: 0, y: 0, width: 1536, height: 1024 }] })); }); select(id);
  }}><option value="">选择类型…</option>{Object.entries(effectNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></section>;
}
export function EnvironmentInspector({ shot, selected, select, change, draw, activeRegion, selectRegion, vertices }: Props & { draw: (replace?: number) => void; vertices: (i: number) => void }) {
  if (shot.studio !== 'pixi') return null;
  const effect = shot.effects.find(e => e.id === selected);
  const update = (fn: (effect: Effect) => void) => change(s => fn(s.effects.find(e => e.id === selected)!));
  return <section className="environment-inspector">
    {effect && <><h2>{effectNames[effect.type]}属性</h2><button className="danger" onClick={() => { change(s => { s.effects = s.effects.filter(e => e.id !== selected); }); select(''); }}>删除当前环境元素</button><label>环境名称<input value={effect.name} onChange={e => update(f => { f.name = e.target.value; })}/></label><label className="check"><input type="checkbox" checked={effect.enabled} onChange={e => update(f => { f.enabled = e.target.checked; })}/>启用环境元素</label>{effect.type !== 'lightning' && <label>环境层级<input type="number" min="-100" max="100" value={effect.layer} onChange={e => update(f => { f.layer = Number(e.target.value); })}/></label>}
    {effect.type !== 'cutout' && <>{(['intensity', 'speed', ...(['rain', 'snow', 'fog'].includes(effect.type) ? ['wind' as const] : [])] as const).map(key => <label key={key}>{({ intensity: '强度', speed: '速度', wind: '额外水平风 / 水流方向' })[key]} · {effect[key].toFixed(2)}<input aria-label={key} type="range" min={key === 'wind' ? -1 : 0} max={key === 'speed' ? 4 : 1} step="0.05" value={effect[key]} onChange={e => update(f => { f[key] = Number(e.target.value); })}/></label>)}{effect.type === 'rain' && <label>雨水密度（数量，与强度分开） · {effect.density.toFixed(2)}<input aria-label="雨水密度" type="range" min="0" max="1" step="0.05" value={effect.density} onChange={e => update(f => { f.density = Number(e.target.value); })}/></label>}{effect.type !== 'water' && effect.type !== 'lightning' && <label>随机种子<input type="number" min="0" max="1000000" value={effect.seed} onChange={e => update(f => { f.seed = Number(e.target.value); })}/></label>}</>}
    {effect.type === 'rain' && <label className="check"><input type="checkbox" checked={effect.splashes} onChange={e => update(f => { f.splashes = e.target.checked; })}/>雨滴涟漪</label>}
    {effect.type !== 'lightning' && <label className="check"><input type="checkbox" checked={effect.collisionEnabled} onChange={e => update(f => { f.collisionEnabled = e.target.checked; })}/>区域启用碰撞</label>}
    {effect.type === 'water' && <fieldset><legend>基础流向（左下角坐标系，Y 正值向上）</legend>{(['x', 'y'] as const).map(axis => <label key={axis}>水流方向 {axis.toUpperCase()}<input aria-label={`水流方向 ${axis.toUpperCase()}`} type="number" min="-1" max="1" step="0.1" value={(effect.flowVector ?? { x: effect.wind < 0 ? -1 : 1, y: 0 })[axis]} onChange={e => update(f => { f.flowVector = { ...(f.flowVector ?? { x: f.wind < 0 ? -1 : 1, y: 0 }), [axis]: Number(e.target.value) }; })}/></label>)}<button onClick={() => update(f => { f.flowVector = null; })}>恢复水平流向</button></fieldset>}
    {effect.type === 'water' && <><p className="muted">使用上方「水流导线」逐点绘制，Enter 完成。多条导线按距离加权合成流向，越近影响越大。</p>{overlappingWaterIds(shot.effects).includes(effect.id) && <p role="alert">水域不能重叠。共边可以，面积重叠时请调整后保存。</p>}{effect.flowLines.map((line, i) => <div key={i}>导线 {i + 1} · {line.length} 点<button onClick={() => update(f => { f.flowLines[i].reverse(); })}>反向</button><button onClick={() => update(f => { f.flowLines.splice(i, 1); })}>删除导线</button></div>)}</>}
    {effect.type !== 'lightning' && <><label className="check"><input type="checkbox" checked={effect.sortY !== null} onChange={e => update(f => { f.sortY = e.target.checked ? (f.regions[0]?.y ?? 0) : null; })}/>自定义遮挡横线</label>{effect.sortY !== null && <label>遮挡线 Y<input type="number" min="0" max="1024" value={effect.sortY} onChange={e => update(f => { f.sortY = Number(e.target.value); })}/></label>}
    <p className="muted">层级优先；同层按脚底 / 落地点 Y 排序。房屋要遮挡雨滴，需要添加覆盖房屋的背景遮挡块。横线仅选中时显示，不进入导出。</p></>}
    {effect.type === 'lightning' && <p className="muted">独立全场雷电闪光，添加即展示，无需开启降雨；速度控制闪光频率。当前不包含雷声音效。</p>}
    {effect.type !== 'lightning' && <RegionFields effect={effect} active={activeRegion} select={selectRegion} update={update} draw={draw} vertices={vertices}/>}</>}
    <h2>昼夜光照</h2><label>时段<select aria-label="时段" value={shot.lighting.time} onChange={e => change(s => { s.lighting.time = e.target.value as Shot['lighting']['time']; })}>{[['morning', '早晨'], ['noon', '中午'], ['evening', '傍晚'], ['night', '夜晚']].map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>{shot.lighting.time === 'night' && <>{(['ambient', 'moon'] as const).map(key => <label key={key}>{key === 'ambient' ? '夜间环境亮度' : '月光强度'}<input type="range" min="0" max="1" step="0.05" value={shot.lighting[key]} onChange={e => change(s => { s.lighting[key] = Number(e.target.value); })}/></label>)}</>}
  </section>;
}
export function WaterOverlapOverlay({ shot }: { shot: Shot }) {
  if (shot.studio !== 'pixi') return null;
  const ids = new Set(overlappingWaterIds(shot.effects));
  if (!ids.size) return null;
  const regions = shot.effects.filter(effect => ids.has(effect.id)).flatMap(effect => effect.regions);
  return <svg className="selection-overlay overlap-overlay" viewBox="0 0 1280 720" aria-label="重叠水域">{regions.map((r, i) => <polygon key={i} points={regionPoints(r).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ')}/>)}</svg>;
}
export function SelectionOverlay({ shot, selected, activeRegion, showAllRegions, interactive, select }: Pick<Props, 'shot' | 'selected' | 'activeRegion'> & { showAllRegions: boolean; interactive: boolean; select: (id: string, region: number) => void }) {
  const effect = shot.effects.find(e => e.id === selected);
  if (shot.studio !== 'pixi') return null;
  const effects = showAllRegions ? shot.effects : effect ? [effect] : [];
  return <svg className="selection-overlay" viewBox="0 0 1280 720" aria-label="选中范围辅助线">{effects.flatMap(f => f.regions.map((r, i) => {
    const points = regionPoints(r).map(p => `${100 + p.x * 720 / 1024},${720 - p.y * 720 / 1024}`).join(' ');
    return <g key={`${f.id}:${i}`}><polygon points={points} opacity={f.enabled ? 1 : 0.45} className={f.id === selected && i === activeRegion ? 'selected-region' : undefined}/>{showAllRegions && interactive && <polygon points={points} role="button" aria-label={`选中 ${f.name} 区域 ${i + 1}`} tabIndex={0} style={{ pointerEvents: 'stroke', stroke: 'transparent', strokeWidth: 12, strokeDasharray: 'none', cursor: 'pointer' }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); select(f.id, i); }} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); select(f.id, i); } }}><title>{f.name} · 区域 {i + 1}</title></polygon>}</g>;
  }))}{effect && effect.sortY !== null && <line x1="100" x2="1180" y1={720 - effect.sortY * 720 / 1024} y2={720 - effect.sortY * 720 / 1024}/>}</svg>;
}
