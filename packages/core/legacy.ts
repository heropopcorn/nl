import { actorSchema, effectSchema, shotSchema, seasons, type Project } from './index';
import { polygonBounds } from './geometry';
import { builtinAssets, type MediaAsset } from './media';

/** Adapter for the actual SceneLayout v1 contract, not Web project version 1. */
export function normalizeLegacyScene(raw: any) {
  if (raw?.version !== 1 || !Array.isArray(raw.path_uv) || raw.shots) return raw;
  const custom = String(raw.ground ?? '').startsWith('user://');
  return { schema_version: 2, scene_id: 'legacy-v1', name: raw.name || '从旧版 v1 导入',
    background: { source: custom ? 'uploaded' : 'preset', preset_id: custom ? null : 'village_default', file: custom ? 'custom_ground.png' : null, pixel_size: [1152, 864] },
    editor: { show_baked_props: !raw.hide_baked_props },
    actors: [{ id: 'legacy-player', character_id: 'farmer_placeholder', display_name: '主角', start_uv: raw.path_uv[0] ?? [0.42, 0.42], route: { points_uv: raw.path_uv, loop: raw.path_loop ?? true, collision_mode: raw.path_ignore_collision === false ? 'world' : 'ignore' } }],
    legacy_water: String(raw.water_mask ?? '').startsWith('user://') ? { mask: 'water_mask.png', flow_dir: raw.water_flow_dir ?? [0.18, 0.92] } : null };
}

export const knownLegacyPreset = (preset: string) => preset === 'village_default' || ['protagonist_village', 'village_school'].some(f => preset === f || seasons.some(s => preset === `${f}_${s}`));

function legacyColor(value: unknown) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(n => typeof n === 'number' && Number.isFinite(n))) return '#' + value.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')).join('');
  return '#8a8172';
}

export function migrateLegacyScene(source: any, backgroundAssetId: string | null = null, customIds: Record<string, string> = {}, customAssets: MediaAsset[] = []) {
  const raw = normalizeLegacyScene(source);
  if (!raw || raw.schema_version !== 2 || typeof raw.name !== 'string') throw new Error('仅支持 Godot scene schema_version=2');
  if (raw.coordinate_space && (raw.coordinate_space.origin !== 'top_left' || raw.coordinate_space.unit !== 'normalized_uv')) throw new Error('旧场景坐标格式不支持');
  const uv = (v: any) => { if (!Array.isArray(v) || v.length < 2 || !v.slice(0, 2).every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('旧场景坐标无效'); return { x: v[0] * 1536, y: (1 - v[1]) * 1024 }; };
  const preset = String(raw.background?.preset_id ?? ''), family = preset.startsWith('village_school') ? 'village_school' : 'protagonist_village';
  if (preset === 'village_default' && !backgroundAssetId) backgroundAssetId = 'legacy_village';
  if (raw.background?.source !== 'preset' && raw.background?.source !== 'blank' && !backgroundAssetId) throw new Error('请同时选择旧场景的背景图片');
  if (raw.background?.source === 'preset' && !knownLegacyPreset(preset) && !backgroundAssetId) throw new Error('此旧预设请同时提供背景 PNG，避免错误替换');
  const stage = preset.replace(`${family}_`, '');
  const shot = shotSchema.parse({ id: crypto.randomUUID(), name: raw.name, studio: 'pixi', frames: 180, caption: '', background: family, season: (seasons as readonly string[]).includes(stage) ? stage : 'original', backgroundAssetId, actors: [], collisionEnabled: raw.editor?.water_collision_enabled ?? true, snap: raw.editor?.snap_enabled ? raw.editor.snap_grid_px : 0 });
  const warnings: string[] = [];
  shot.blank = raw.background?.source === 'blank';
  shot.blankColor = legacyColor(raw.background?.fill_color);
  // Keep unconverted extension fields and the original contract in JSON exports.
  shot.legacySource = structuredClone(source);
  const px = raw.background?.pixel_size ?? [1536, 1024];
  if (source.version === 1 && backgroundAssetId) {
    const bg = customAssets.find(a => a.id === backgroundAssetId);
    if (bg) { px[0] = bg.width; px[1] = bg.height; }
  }
  const scaleX = 1536 / px[0], scaleY = 1024 / px[1];
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) throw new Error('旧背景尺寸无效');
  for (const a of raw.actors ?? []) {
    const start = uv(a.start_uv), points = (a.route?.points_uv ?? []).map(uv);
    const route = points.length && (points[0].x !== start.x || points[0].y !== start.y) ? [start, ...points] : points;
    const characterMap: Record<string, string> = { farmer_placeholder: 'player', farmer_blue_placeholder: 'farmer_blue' };
    const assetId = customIds[a.character_id] ?? characterMap[a.character_id] ?? 'player';
    shot.actors.push(actorSchema.parse({ id: String(a.id), name: a.display_name || a.character_id, assetId, enabled: a.enabled, start, end: start, layer: a.layer, route, speed: (a.route?.speed_px_per_sec ?? 210) * scaleX, loop: a.route?.loop, routeVisible: a.route?.visible, collision: a.route?.collision_mode === 'world' ? 'stop' : a.route?.collision_mode ?? 'ignore' }));
    if (a.route?.collision_mode === 'world') warnings.push(`角色 ${a.display_name || a.id}：世界碰撞已转换为区域碰撞停止，不包含旧版滑动等物理行为`);
    if (!characterMap[a.character_id] && !customIds[a.character_id]) warnings.push(`角色 ${a.display_name} 使用占位图；请在资源库替换原角色贴图`);
  }
  for (const e of raw.elements ?? []) {
    const assetId = customIds[e.asset_id] ?? e.asset_id, asset = [...builtinAssets, ...customAssets].find(a => a.id === assetId);
    if (!asset && !customIds[e.asset_id]) throw new Error(`缺失旧自定义资源：${e.asset_id}，请一并上传资源及资源索引`);
    const start = uv(e.position_uv);
    if (!asset) throw new Error(`自定义资源 ${e.asset_id} 缺少真实图片尺寸`);
    shot.actors.push(actorSchema.parse({ id: String(e.id), name: e.display_name || e.asset_id, assetId, enabled: e.enabled, start, end: start, layer: e.layer, scale: e.scale, rotation: -(e.rotation_degrees ?? 0), flipX: e.flip_h, width: asset.width * scaleX, height: asset.height * scaleY, sortY: typeof e.sort_offset_y === 'number' ? start.y - e.sort_offset_y * scaleY : null }));
  }
  function polygon(r: any) { const points = r.points_uv.map(uv); return { ...polygonBounds(points), points }; }
  for (const water of raw.water_regions ?? []) {
    const r = water.rect_uv;
    const region = water.shape === 'polygon' ? polygon(water) : { x: r[0] * 1536, y: (1 - r[1] - r[3]) * 1024, width: r[2] * 1536, height: r[3] * 1024 };
    shot.effects.push(effectSchema.parse({ id: String(water.id), name: water.name || '水域', type: 'water', enabled: water.enabled, layer: water.layer, speed: water.flow_speed ?? 1, flowVector: { x: (water.flow_dir?.[0] ?? 0.18) * scaleX, y: -(water.flow_dir?.[1] ?? 0.92) * scaleY }, collisionEnabled: water.collision_enabled, flowLines: (water.flow_lines ?? []).map((l: any[]) => l.map(uv)), regions: [region] }));
  }
  for (const region of raw.background_regions ?? []) { const r = polygon(region); shot.effects.push(effectSchema.parse({ id: String(region.id), name: region.name || '背景裁片', type: 'cutout', enabled: region.enabled, layer: region.layer, regions: [r], sortY: typeof region.sort_offset_y === 'number' ? r.y + r.height / 2 - region.sort_offset_y * 1024 / (raw.background?.pixel_size?.[1] || 1024) : null })); }
  const weather = raw.weather ?? {};
  for (const region of raw.rain_regions ?? []) shot.effects.push(effectSchema.parse({ id: String(region.id), name: region.name || '降雨', type: 'rain', enabled: (region.enabled ?? true) && !!weather.enabled, intensity: weather.intensity, density: weather.rain_density ?? 0.6, splashes: region.splashes_enabled, layer: region.layer, regions: [polygon(region)] }));
  if (weather.enabled && !(raw.rain_regions?.length)) shot.effects.push(effectSchema.parse({ id: crypto.randomUUID(), name: '全场降雨', type: 'rain', intensity: weather.intensity, density: weather.rain_density ?? 0.6, regions: [{ x: 0, y: 0, width: 1536, height: 1024 }] }));
  shot.lighting = { time: weather.time_of_day ?? 'noon', ambient: weather.night_ambient ?? 0.35, moon: weather.moonlight_enabled === false ? 0 : weather.moonlight_intensity ?? 0.65 };
  const windDirection = Array.isArray(weather.wind_direction) ? weather.wind_direction : [1, 0];
  shot.wind = { enabled: !!weather.wind_enabled, strength: weather.wind_strength ?? 0.45, speed: 1, direction: { x: Number(windDirection[0] ?? 1), y: Number(windDirection[1] ?? 0) }, gust: weather.wind_speed ?? 0.5 };
  shot.lightning = { enabled: !!weather.lightning_enabled, intensity: weather.lightning_intensity ?? 0.7, interval: 14 - (weather.lightning_frequency ?? 0.35) * 11 };
  if (raw.camera) warnings.push('旧相机扩展仅保留原始 JSON，当前仍使用新版画布视图');
  if (raw.legacy_water) warnings.push('旧位图水域尚未参与渲染和碰撞：仅保留 JSON 引用，请保管原始蒙版图片');
  if (raw.editor?.show_baked_props) warnings.push('旧内置烘焙道具尚未自动重建，请在资源库中补放；原始配置已保留');
  return { shot: shotSchema.parse(shot), warnings };
}

/** Append as one undoable operation, retaining chapter and scene order. */
export function appendLegacyScenes(project: Project, entries: { sourceId: string; shot: Project['shots'][number] }[], index?: any) {
  const ids = entries.map(e => e.sourceId);
  if (new Set(ids).size !== ids.length) throw new Error('旧场景 ID 重复，请分批导入或修正文件');
  const chapters = Array.isArray(index?.chapters) ? [...index.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  const sceneIndex = Array.isArray(index?.scenes) ? [...index.scenes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
  if (new Set(chapters.map(c => c.id)).size !== chapters.length || new Set(sceneIndex.map(s => s.id)).size !== sceneIndex.length) throw new Error('章节索引含重复 ID');
  const chapterIds = new Map<string, string>();
  for (const chapter of chapters) {
    const id = crypto.randomUUID(); chapterIds.set(chapter.id, id);
    project.chapters.push({ id, name: chapter.name });
  }
  let fallback: string | undefined;
  const rank = (id: string) => { const row = sceneIndex.find(s => s.id === id); const chapter = chapters.findIndex(c => c.id === row?.chapter_id); const scene = sceneIndex.findIndex(s => s.id === id); return (chapter < 0 ? chapters.length : chapter) * (sceneIndex.length + entries.length + 1) + (scene < 0 ? sceneIndex.length + ids.indexOf(id) : scene); };
  for (const entry of [...entries].sort((a, b) => rank(a.sourceId) - rank(b.sourceId))) {
    const info = sceneIndex.find(s => s.id === entry.sourceId);
    let chapterId = chapterIds.get(info?.chapter_id);
    if (!chapterId) {
      if (!fallback) { fallback = crypto.randomUUID(); project.chapters.push({ id: fallback, name: '从 Godot 导入（未归档）' }); }
      chapterId = fallback;
    }
    const sceneId = crypto.randomUUID(), shot = structuredClone(entry.shot);
    project.scenes.push({ id: sceneId, name: shot.name, chapterId });
    shot.sceneId = sceneId; project.shots.push(shot);
  }
}

/** Ambiguous basenames require explicit binding, never the first file. */
export function matchLegacyFile(paths: string[], owner: string, reference: string): number | null {
  const normalized = reference.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  const parent = owner.includes('/') ? owner.slice(0, owner.lastIndexOf('/') + 1) : '';
  const exact = paths.map((path, i) => path === parent + normalized ? i : -1).filter(i => i >= 0);
  if (exact.length === 1) return exact[0];
  const candidates = paths.map((path, i) => path.split('/').at(-1) === normalized.split('/').at(-1) ? i : -1).filter(i => i >= 0);
  return candidates.length === 1 ? candidates[0] : null;
}
