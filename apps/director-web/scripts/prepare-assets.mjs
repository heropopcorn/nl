import { mkdir, copyFile, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { buildPaths } from '../build-paths.mjs';
const root = new URL('../../../', import.meta.url);
const profile = process.argv.includes('--full') ? 'full' : process.env.NL_ASSET_PROFILE || 'demo';
const mode = process.env.NL_MODE || 'preview';
const output = new URL(`../${buildPaths({NL_MODE:mode, NL_ASSET_PROFILE:profile}).publicDir}/art/`, import.meta.url);
await mkdir(output, { recursive: true });
if (!['demo', 'full'].includes(profile) || !['preview', 'local'].includes(mode)) throw new Error('Invalid NL mode/profile');
if (mode === 'local' && profile !== 'full') throw new Error('本地工作模式必须使用 full 资源');
const demo = JSON.parse(await readFile(new URL('./demo-assets.json', import.meta.url), 'utf8'));
// Only this generated art directory is cleaned; original assets are never removed.
for (const file of await readdir(output)) if (/^[a-z0-9_]+\.png$/.test(file)) await unlink(new URL(file, output));
const available = [];
async function publish(input, filename) { await copyFile(input, new URL(filename, output)); available.push(`/art/${filename}`); }
for (const file of await readdir(new URL('assets/nl-ui/', root))) {
  if (!file.endsWith('.png')) continue;
  const id = 'nl_' + file.replace(/^\d+-/, '').replace('.png', '').replaceAll('-', '_');
  if (profile === 'demo' && !demo.builtinIds.includes(id)) continue;
  await publish(new URL(`assets/nl-ui/${file}`, root), `${id}.png`);
}
const manifest = {};
const seasons = ['', ...['spring', 'summer', 'autumn', 'winter'].flatMap(s => ['early', 'mid', 'late'].map(p => `${s}_${p}`))];
for (const family of ['protagonist_village', 'village_school']) for (const season of seasons) {
  if (profile === 'demo' && !demo.seasons.includes(season)) continue;
  const name = family + (season ? `_${season}` : '');
  const variants = {};
  for (const quality of ['default', 'x2', 'x4']) {
    if (profile === 'demo' && !demo.qualities.includes(quality)) continue;
    const filename = name + (quality === 'default' ? '' : `_${quality}`) + '.png';
    const input = new URL(`video_game/art/backgrounds/${season ? 'seasons/' : ''}${filename}`, root);
    try {
      const bytes = await readFile(input);
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`不是 PNG：${input}`);
      await publish(input, filename);
      variants[quality] = { url: `/art/${filename}`, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    } catch (error) { if (error.code !== 'ENOENT' || quality === 'default') throw error; }
  }
  manifest[name] = variants;
}
await writeFile(new URL('../assets.json', output), JSON.stringify(manifest, null, 2));
await publish(new URL('video_game/art/generated/player_placeholder.png', root), 'player.png');
await publish(new URL('video_game/art/approved/chatgpt-terrain-ground-approved.png', root), 'legacy_village.png');
for (const file of (await readdir(new URL('video_game/art/sliced/', root))).filter(file => file.endsWith('.png'))) {
  if (profile === 'demo' && !demo.builtinIds.includes(file.slice(0, -4))) continue;
  await publish(new URL(`video_game/art/sliced/${file}`, root), file);
}
await writeFile(new URL('../runtime.json', output), JSON.stringify({ mode, profile, available }, null, 2));
console.log(`资源配置：${mode}/${profile}，发布 ${available.length} 张图片`);
