import type { Effect } from '../../../packages/core';
import { regionPoints, polygonBounds } from '../../../packages/core/geometry';
import { NumberField } from './NumberField';

export function RegionFields({ effect, active, select, update, draw, vertices }: { effect: Effect; active: number | null; select: (i: number | null) => void; update: (fn: (e: Effect) => void) => boolean | void; draw: (i?: number) => void; vertices: (i: number) => void }) {
  return <section className="region-manager"><h2>区域列表 · {effect.regions.length} / 12</h2><p className="muted">选择区域后可单独移动、缩放、旋转或编辑顶点；删除区域不会删除其他区域。</p>
    {!effect.regions.length && <p role="status">暂无区域，此元素暂不产生效果。请绘制新区域。</p>}
    {effect.regions.map((r, i) => <fieldset className={`region-fields ${active === i ? 'active-region' : ''}`} key={i}><legend>区域 {i + 1} · {r.points ? '多边形' : '矩形'}</legend>
      <button className={active === i ? 'active' : ''} onClick={() => select(i)}>选中区域 {i + 1}</button>
      {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{({ x: 'X', y: 'Y', width: '宽', height: '高' })[key]}<NumberField aria-label={`范围${i + 1}-${key}`} value={r[key]} onValueChange={value => update(f => {
        const old = f.regions[i], next = { ...old, [key]: value };
        if (old.points) { const points = regionPoints(old).map(p => ({ x: next.x + (p.x - old.x) * next.width / old.width, y: next.y + (p.y - old.y) * next.height / old.height })); f.regions[i] = { ...next, ...polygonBounds(points), points }; }
        else f.regions[i] = next;
      })}/></label>)}
      {effect.type === 'rain' && <label className="check"><input type="checkbox" aria-label={`范围${i + 1}水花`} checked={r.splashes ?? effect.splashes} onChange={e => update(f => { f.regions[i].splashes = e.target.checked; })}/>此区域水花</label>}
      <button onClick={() => { select(i); vertices(i); }}>编辑区域 {i + 1} 顶点</button><button onClick={() => { select(i); draw(i); }}>重绘区域 {i + 1}</button>
      <button className="danger" onClick={() => { update(f => { f.regions.splice(i, 1); }); select(null); }}>删除区域 {i + 1}</button>
    </fieldset>)}
    <button disabled={effect.regions.length >= 12} onClick={() => draw()}>套索添加区域</button>
    <button disabled={effect.regions.length >= 12} onClick={() => { if (update(f => f.regions.push({ x: 100, y: 100, width: 300, height: 200 })) !== false) select(effect.regions.length); }}>添加矩形区域</button>
  </section>;
}
