import type { Shot } from '../core';
import { builtinAssets, type MediaAsset } from '../core/media';

/** Whether the stationary editor frame changes with the live environment clock.
 * Actor routes, motion graphics and 3D spins use the timeline clock instead.
 */
export function needsLivePreview(shot: Shot, assets: MediaAsset[] = []) {
  if (shot.studio !== 'pixi') return false;
  // Zero strength still draws faint strands; speed, not strength, freezes them.
  if (shot.wind.enabled && shot.wind.speed > 0) return true;
  if (shot.lightning.enabled && shot.lightning.intensity > 0) return true;
  if (shot.effects.some(effect => {
    if (!effect.enabled || effect.intensity <= 0 || effect.type === 'cutout') return false;
    // Lightning has no region and uses a minimum speed in the compositor.
    if (effect.type === 'lightning') return true;
    return effect.speed > 0 && effect.regions.length > 0
      && (effect.type !== 'rain' || effect.density > 0);
  })) return true;
  const media = [...builtinAssets, ...assets];
  return shot.actors.some(actor => {
    if (!actor.enabled) return false;
    const asset = media.find(item => item.id === actor.assetId);
    return !!asset && asset.fps > 0 && (asset.frameRects?.length ?? asset.columns * asset.rows) > 1;
  });
}
