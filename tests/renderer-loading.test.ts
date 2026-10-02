import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sample } from '../packages/core';
import { mediaSchema } from '../packages/core/media';

const loading = vi.hoisted(() => ({ texture: vi.fn(), image: vi.fn(), destroy: vi.fn() }));
vi.mock('pixi.js', () => ({
  Application: class {
    init = async () => {};
    destroy = loading.destroy;
  },
  Assets: { load: loading.texture },
  Graphics: class {}, Sprite: class {},
}));
import { DirectorRenderer } from '../packages/studios';

const manifest = Object.fromEntries(['protagonist_village', 'village_school'].map(name => [name, {
  default: { url: `/art/${name}.png`, width: 1536, height: 1024 },
}]));

describe('renderer resource preparation', () => {
  let renderer: DirectorRenderer | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    loading.texture.mockImplementation(async (url: string) => ({ url }));
    loading.image.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
    vi.stubGlobal('document', { createElement: () => ({ remove() {} }) });
    vi.stubGlobal('Image', class {
      src = '';
      decode() { return loading.image(this.src); }
    });
  });
  afterEach(() => { renderer?.dispose(); renderer = undefined; vi.unstubAllGlobals(); });

  const customScene = () => {
    const project = structuredClone(sample);
    project.assets = [mediaSchema.parse({ id: 'custom', name: '人物', category: 'characters', src: 'data:image/png;base64,YQ==' })];
    project.shots[0].actors[0].assetId = 'custom';
    project.shots[0].actors.push({ ...structuredClone(project.shots[0].actors[0]), id: 'second' });
    return project;
  };

  it('starts both backgrounds and the player image in parallel', async () => {
    const finish: (() => void)[] = [];
    loading.texture.mockImplementation(() => new Promise(resolve => finish.push(() => resolve({}))));
    loading.image.mockImplementation(() => new Promise<void>(resolve => finish.push(resolve)));
    const creating = DirectorRenderer.create();
    await vi.waitFor(() => expect(finish).toHaveLength(3));
    finish.forEach(resolve => resolve()); renderer = await creating;
    expect(loading.texture).toHaveBeenCalledTimes(2);
    expect(loading.image).toHaveBeenCalledTimes(1);
  });

  it('shares image decoding across actors and overlapping prepares', async () => {
    renderer = await DirectorRenderer.create(); loading.image.mockClear();
    const project = customScene();
    await Promise.all([renderer.prepare(project, 0), renderer.prepare(project, 0)]);
    expect(loading.image).toHaveBeenCalledTimes(1);
    expect(renderer.isPrepared(project, 0)).toBe(true);
    await renderer.prepare(project, 0);
    expect(loading.image).toHaveBeenCalledTimes(1);
    project.assets[0].src = 'data:image/png;base64,Yg==';
    expect(renderer.isPrepared(project, 0)).toBe(false);
    await renderer.prepare(project, 0);
    expect(loading.image).toHaveBeenCalledTimes(2);
  });

  it('does not permanently cache decode or texture failures', async () => {
    renderer = await DirectorRenderer.create();
    const project = customScene();
    loading.image.mockRejectedValueOnce(new Error('decode failure'));
    await expect(renderer.prepare(project, 0)).rejects.toThrow('decode failure');
    expect(renderer.isPrepared(project, 0)).toBe(false);
    await renderer.prepare(project, 0);
    expect(renderer.isPrepared(project, 0)).toBe(true);
    project.shots[0].backgroundAssetId = project.assets[0].id;
    loading.texture.mockRejectedValueOnce(new Error('texture failure'));
    await expect(renderer.prepare(project, 0)).rejects.toThrow('texture failure');
    expect(renderer.isPrepared(project, 0)).toBe(false);
    await renderer.prepare(project, 0);
    expect(renderer.isPrepared(project, 0)).toBe(true);
  });

  it('validates all sources before starting a partially orphaned load', async () => {
    renderer = await DirectorRenderer.create(); loading.image.mockClear();
    const project = customScene(); project.shots[0].actors[1].assetId = 'missing';
    await expect(renderer.prepare(project, 0)).rejects.toThrow('缺失资源');
    expect(loading.image).not.toHaveBeenCalled();
    project.shots[0].actors.pop(); project.shots[0].backgroundAssetId = 'missing-background';
    await expect(renderer.prepare(project, 0)).rejects.toThrow('自定义背景资源缺失');
    expect(loading.image).not.toHaveBeenCalled();
  });

  it('rejects late image preparation after disposal and disposes only once', async () => {
    renderer = await DirectorRenderer.create();
    let finish!: () => void;
    loading.image.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const preparing = renderer.prepare(customScene(), 0);
    await vi.waitFor(() => expect(finish).toBeDefined());
    renderer.dispose(); finish();
    await expect(preparing).rejects.toThrow('影棚已关闭');
    await expect(renderer.prepare(customScene(), 0)).rejects.toThrow('影棚已关闭');
    renderer.dispose(); expect(loading.destroy).toHaveBeenCalledTimes(1);
  });
});
