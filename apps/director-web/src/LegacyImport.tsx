import { type Project } from '../../../packages/core';
import { migrateLegacyScene } from '../../../packages/core/legacy';
import { importMedia } from './storage';
export function LegacyImport({ edit, notify }: { edit: (fn: (p: Project) => void) => void; notify: (s: string) => void }) {
  return <label className="button">导入 Godot 场景<input aria-label="导入旧场景" type="file" multiple accept=".json,.png,.jpg,.jpeg,.webp" hidden onChange={async e => {
    const files = [...(e.target.files ?? [])]; e.target.value = '';
    try {
      const jsons = await Promise.all(files.filter(f => f.name.endsWith('.json')).map(async file => ({ file, data: JSON.parse(await file.text()) })));
      const sources = jsons.filter(j => j.data.schema_version === 2 && j.data.scene_id); if (!sources.length) throw new Error('未找到 v2 场景 JSON');
      const assets: Project['assets'] = [], customIds: Record<string, string> = {};
      for (const index of jsons.filter(j => Array.isArray(j.data.assets))) for (const item of index.data.assets) {
        const file = files.find(f => f.name === item.file); if (!file) throw new Error(`缺失资源图片 ${item.file}`);
        const asset = await importMedia(file, item.category); assets.push(asset); customIds[item.id] = asset.id;
      }
      const converted: ReturnType<typeof migrateLegacyScene>[] = [];
      for (const source of sources) {
        let bg: string | null = null;
        if (source.data.background?.source !== 'preset') {
          const file = files.find(f => f.name === (source.data.background?.file || 'background.png')); if (!file) throw new Error(`${source.data.name} 缺少背景图片`);
          const asset = await importMedia(file, 'backgrounds'); assets.push(asset); bg = asset.id;
        }
        converted.push(migrateLegacyScene(source.data, bg, customIds));
      }
      const message = converted.flatMap(r => r.warnings).join('\n');
      if (message && !confirm(`导入前请确认这些差异：\n${message}\n是否继续？`)) return;
      edit(p => { p.assets.push(...assets); const chapterId = crypto.randomUUID(); p.chapters.push({ id: chapterId, name: '从 Godot 导入' }); converted.forEach(({ shot }) => { const sceneId = crypto.randomUUID(); p.scenes.push({ id: sceneId, name: shot.name, chapterId }); shot.sceneId = sceneId; p.shots.push(shot); }); });
      notify(`已导入 ${converted.length} 个旧场景；请检查角色资源、速度和遮挡，原始文件未改写`);
    } catch (error) { notify(`导入失败：${String(error)}`); }
  }}/></label>;
}
