import { describe, expect, it } from 'vitest';
import { effectSchema, sample } from '../packages/core';
import { mediaSchema } from '../packages/core/media';
import { needsLivePreview } from '../packages/studios/live-policy';

describe('live editor redraw policy', () => {
  const scene = () => structuredClone(sample.shots[0]);
  const effect = (type: 'water' | 'rain' | 'snow' | 'fog' | 'lightning' | 'cutout') => effectSchema.parse({
    id: type, name: type, type, regions: [{ x: 0, y: 0, width: 400, height: 300 }],
  });

  it('leaves a static scene and timeline-only animation idle', () => {
    const shot = scene();
    expect(needsLivePreview(shot)).toBe(false);
    shot.actors[0].end.x += 200;
    expect(needsLivePreview(shot)).toBe(false);
    shot.effects.push(effect('cutout'));
    expect(needsLivePreview(shot)).toBe(false);
    shot.studio = 'three'; shot.lightning.enabled = true;
    expect(needsLivePreview(shot)).toBe(false);
    shot.studio = 'motion';
    expect(needsLivePreview(shot)).toBe(false);
  });

  it.each(['water', 'rain', 'snow', 'fog'] as const)('runs visible moving %s and freezes zero speed', type => {
    const shot = scene(), item = effect(type); shot.effects = [item];
    expect(needsLivePreview(shot)).toBe(true);
    item.speed = 0; expect(needsLivePreview(shot)).toBe(false);
    item.speed = 1; item.enabled = false; expect(needsLivePreview(shot)).toBe(false);
    item.enabled = true; item.intensity = 0; expect(needsLivePreview(shot)).toBe(false);
    item.intensity = 0.8; item.regions = []; expect(needsLivePreview(shot)).toBe(false);
  });

  it('skips zero-density rain but does not apply density to other weather', () => {
    const shot = scene(), item = effect('rain'); shot.effects = [item]; item.density = 0;
    expect(needsLivePreview(shot)).toBe(false);
    item.type = 'snow'; expect(needsLivePreview(shot)).toBe(true);
  });

  it('preserves faint zero-strength wind, and freezes zero-speed wind', () => {
    const shot = scene(); shot.wind.enabled = true; shot.wind.strength = 0;
    expect(needsLivePreview(shot)).toBe(true);
    shot.wind.speed = 0; expect(needsLivePreview(shot)).toBe(false);
    shot.wind.speed = 1; shot.wind.enabled = false; expect(needsLivePreview(shot)).toBe(false);
  });

  it('animates both lightning controls, including regionless zero-speed elements', () => {
    const shot = scene(); shot.lightning.enabled = true;
    expect(needsLivePreview(shot)).toBe(true);
    shot.lightning.intensity = 0; expect(needsLivePreview(shot)).toBe(false);
    const item = effect('lightning'); item.regions = []; item.speed = 0; shot.effects = [item];
    expect(needsLivePreview(shot)).toBe(true);
    item.intensity = 0; expect(needsLivePreview(shot)).toBe(false);
  });

  it('animates visible grid and cropped sprite sequences, respecting explicit frame precedence', () => {
    const shot = scene(); shot.actors[0].assetId = 'test';
    const asset = mediaSchema.parse({ id: 'test', name: 'test', category: 'characters', src: '/art/player.png', columns: 2, width: 82, height: 119 });
    expect(needsLivePreview(shot, [asset])).toBe(true);
    shot.actors[0].enabled = false; expect(needsLivePreview(shot, [asset])).toBe(false);
    shot.actors[0].enabled = true;
    asset.frameRects = [{ x: 0, y: 0, width: 41, height: 119 }];
    expect(needsLivePreview(shot, [asset])).toBe(false);
    asset.columns = 1; asset.frameRects.push({ x: 41, y: 0, width: 41, height: 119 });
    expect(needsLivePreview(shot, [asset])).toBe(true);
  });
});
