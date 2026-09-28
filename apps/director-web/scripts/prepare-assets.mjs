import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
const root = new URL('../../../', import.meta.url);
const output = new URL('../public/art/', import.meta.url);
await mkdir(output, { recursive: true });
const manifest = {};
const seasons = ['', ...['spring', 'summer', 'autumn', 'winter'].flatMap(s => ['early', 'mid', 'late'].map(p => `${s}_${p}`))];
for (const family of ['protagonist_village', 'village_school']) for (const season of seasons) {
  const name = family + (season ? `_${season}` : '');
  const variants = {};
  for (const quality of ['default', 'x2', 'x4']) {
    const filename = name + (quality === 'default' ? '' : `_${quality}`) + '.png';
    const input = new URL(`video_game/art/backgrounds/${season ? 'seasons/' : ''}${filename}`, root);
    try {
      const bytes = await readFile(input);
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`不是 PNG：${input}`);
      await copyFile(input, new URL(filename, output));
      variants[quality] = { url: `/art/${filename}`, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    } catch (error) { if (error.code !== 'ENOENT' || quality === 'default') throw error; }
  }
  manifest[name] = variants;
}
await writeFile(new URL('../assets.json', output), JSON.stringify(manifest, null, 2));
await copyFile(new URL('video_game/art/generated/player_placeholder.png', root), new URL('player.png', output));
await copyFile(new URL('video_game/art/approved/chatgpt-terrain-ground-approved.png', root), new URL('legacy_village.png', output));
for (const file of (await readdir(new URL('video_game/art/sliced/', root))).filter(file => file.endsWith('.png'))) await copyFile(new URL(`video_game/art/sliced/${file}`, root), new URL(file, output));
