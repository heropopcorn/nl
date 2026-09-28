import { z } from 'zod';
import type { Shot } from './index';
import { builtinAssets, type MediaAsset } from './media';
export const qualities = ['default', 'x2', 'x4'] as const;
export type Quality = typeof qualities[number];
const assetSchema = z.object({ url: z.string().regex(/^\/art\/[a-z0-9_]+\.png$/), width: z.number().int().positive(), height: z.number().int().positive() });
export const manifestSchema = z.record(z.string(), z.object({ default: assetSchema, x2: assetSchema.optional(), x4: assetSchema.optional() }));
export type BackgroundManifest = z.infer<typeof manifestSchema>;
export function backgroundKey(shot: Pick<Shot, 'background' | 'season'>) { return `${shot.background}${shot.season === 'original' ? '' : `_${shot.season}`}`; }
export function resolveBackground(manifest: BackgroundManifest, shot: Pick<Shot, 'background' | 'season'> & Partial<Pick<Shot, 'backgroundAssetId' | 'backgroundVersions'>>, quality: Quality, assets: MediaAsset[] = []) {
  if (shot.backgroundAssetId) {
    assets = [...builtinAssets, ...assets];
    const requestedId = quality === 'default' ? shot.backgroundAssetId : shot.backgroundVersions?.[quality];
    const asset = assets.find(a => a.id === requestedId) ?? assets.find(a => a.id === shot.backgroundAssetId);
    if (!asset) throw new Error('自定义背景资源缺失');
    return { url: asset.src, width: asset.width, height: asset.height, quality: (asset.id === requestedId ? quality : 'default') as Quality, requested: quality };
  }
  const variants = manifest[backgroundKey(shot)];
  if (!variants) throw new Error('当前时节背景不存在，请检查资源清单');
  const effective: Quality = variants[quality] ? quality : 'default';
  return { ...variants[effective]!, quality: effective, requested: quality };
}
