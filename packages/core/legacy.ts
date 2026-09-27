import { actorSchema, effectSchema, shotSchema, seasons, type Shot } from './index';
import { polygonBounds } from './geometry';
import { builtinAssets } from './media';
export function migrateLegacyScene(raw: any, backgroundAssetId: string | null = null, customIds: Record<string, string> = {}) {
  if (!raw || raw.schema_version !== 2 || typeof raw.name !== 'string') throw new Error('仅支持 Godot scene schema_version=2');
  if (raw.coordinate_space && (raw.coordinate_space.origin !== 'top_left' || raw.coordinate_space.unit !== 'normalized_uv')) throw new Error('旧场景坐标格式不支持');
  const uv = (v: any) => { if (!Array.isArray(v) || v.length < 2 || !v.slice(0, 2).every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('旧场景坐标无效'); return { x: v[0] * 1536, y: (1 - v[1]) * 1024 }; };
  const preset = String(raw.background?.preset_id ?? ''), family = preset.startsWith('village_school') ? 'village_school' : 'protagonist_village';
  if (preset === 'village_default' && !backgroundAssetId) backgroundAssetId = 'legacy_village';
  if (raw.background?.source !== 'preset' && !backgroundAssetId) throw new Error('请同时选择旧场景的背景图片');
  if (raw.background?.source === 'preset' && !preset.startsWith('protagonist_village') && !preset.startsWith('village_school') && !backgroundAssetId) throw new Error('此旧预设请同时提供背景 PNG，避免错误替换');
  const stage = preset.replace(`${family}_`, '');
  const shot = shotSchema.parse({ id: crypto.randomUUID(), name: raw.name, studio: 'pixi', frames: 180, caption: '', background: family, season: (seasons as readonly string[]).includes(stage) ? stage : 'original', backgroundAssetId, actors: [], collisionEnabled: raw.editor?.water_collision_enabled ?? true, snap: raw.editor?.snap_enabled ? raw.editor.snap_grid_px : 0 });
  const warnings: string[] = [];
  for (const a of raw.actors ?? []) {
    const start = uv(a.start_uv), points = (a.route?.points_uv ?? []).map(uv);
    const route = points.length && (points[0].x !== start.x || points[0].y !== start.y) ? [start, ...points] : points;
    shot.actors.push(actorSchema.parse({ id: String(a.id), name: a.display_name || a.character_id, enabled: a.enabled, start, end: start, layer: a.layer, route, speed: (a.route?.speed_px_per_sec ?? 210) * 1536 / (raw.background?.pixel_size?.[0] || 1536), loop: a.route?.loop, routeVisible: a.route?.visible, collision: a.route?.collision_mode ?? 'ignore' }));
    if (a.character_id !== 'farmer_placeholder') warnings.push(`角色 ${a.display_name} 使用占位图；请在资源库替换原角色贴图`);
  }
  for (const e of raw.elements ?? []) {
    const assetId = customIds[e.asset_id] ?? e.asset_id, asset = builtinAssets.find(a => a.id === assetId);
    if (!asset && !customIds[e.asset_id]) throw new Error(`缺失旧自定义资源：${e.asset_id}，请一并上传资源及资源索引`);
    const start = uv(e.position_uv);
    shot.actors.push(actorSchema.parse({ id: String(e.id), name: e.display_name || e.asset_id, assetId, enabled: e.enabled, start, end: start, layer: e.layer, scale: e.scale, rotation: -(e.rotation_degrees ?? 0), flipX: e.flip_h, width: (asset?.width ?? 230) * 1536 / (raw.background?.pixel_size?.[0] || 1536), height: (asset?.height ?? 230) * 1024 / (raw.background?.pixel_size?.[1] || 1024), sortY: typeof e.sort_offset_y === 'number' ? start.y - e.sort_offset_y * 1024 / (raw.background?.pixel_size?.[1] || 1024) : null }));
  }
  function polygon(r: any) { const points = r.points_uv.map(uv); return { ...polygonBounds(points), points }; }
  for (const water of raw.water_regions ?? []) {
    const r = water.rect_uv;
    const region = water.shape === 'polygon' ? polygon(water) : { x: r[0] * 1536, y: (1 - r[1] - r[3]) * 1024, width: r[2] * 1536, height: r[3] * 1024 };
    shot.effects.push(effectSchema.parse({ id: String(water.id), name: water.name || '水域', type: 'water', enabled: water.enabled, layer: water.layer, speed: water.flow_speed ?? 1, wind: water.flow_dir?.[0] ?? 0.2, collisionEnabled: water.collision_enabled, flowLines: (water.flow_lines ?? []).map((l: any[]) => l.map(uv)), regions: [region] }));
  }
  for (const region of raw.background_regions ?? []) { const r = polygon(region); shot.effects.push(effectSchema.parse({ id: String(region.id), name: region.name || '背景裁片', type: 'cutout', enabled: region.enabled, layer: region.layer, regions: [r], sortY: typeof region.sort_offset_y === 'number' ? r.y + r.height / 2 - region.sort_offset_y * 1024 / (raw.background?.pixel_size?.[1] || 1024) : null })); }
  const weather = raw.weather ?? {};
  for (const region of raw.rain_regions ?? []) shot.effects.push(effectSchema.parse({ id: String(region.id), name: region.name || '降雨', type: 'rain', enabled: (region.enabled ?? true) && !!weather.enabled, intensity: weather.intensity, splashes: region.splashes_enabled, layer: region.layer, regions: [polygon(region)] }));
  if (weather.enabled && !(raw.rain_regions?.length)) shot.effects.push(effectSchema.parse({ id: crypto.randomUUID(), name: '全场降雨', type: 'rain', intensity: weather.intensity, regions: [{ x: 0, y: 0, width: 1536, height: 1024 }] }));
  shot.lighting = { time: weather.time_of_day ?? 'noon', ambient: weather.night_ambient ?? 0.35, moon: weather.moonlight_enabled === false ? 0 : weather.moonlight_intensity ?? 0.65 };
  shot.wind = { enabled: !!weather.wind_enabled, strength: (weather.wind_direction?.[0] ?? 1) * (weather.wind_strength ?? 0.4), speed: weather.wind_speed ?? 1 };
  shot.lightning = { enabled: !!weather.lightning_enabled, intensity: weather.lightning_intensity ?? 0.7, interval: 14 - (weather.lightning_frequency ?? 0.35) * 11 };
  if (raw.camera || raw.legacy_water || raw.editor?.show_baked_props) warnings.push('旧版烘焙道具/相机/位图水域请复核，原始 JSON 保持不变');
  return { shot: shotSchema.parse(shot), warnings };
}
