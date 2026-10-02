import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { object3dSchema, mediaSchema } from '../packages/core/media';
import { sample } from '../packages/core';

const modelIO = vi.hoisted(() => ({ load: vi.fn(), remove: vi.fn(), instantiate: vi.fn(), destroy: vi.fn(), nextId: 0 }));
vi.mock('playcanvas', async () => {
  const { EventEmitter } = await import('node:events');
  class Entity {
    children: Entity[] = [];
    camera = { fov: 50 };
    name: string;
    constructor(name = '') { this.name = name; }
    addComponent() {} addChild(entity: Entity) { this.children.push(entity); }
    setPosition() {} setLocalScale() {} setEulerAngles() {} lookAt() {} destroy() {}
  }
  return {
    Entity,
    Color: class { fromString() { return this; } },
    Application: class {
      assets = { add() {}, load: modelIO.load, remove: modelIO.remove };
      scene = {}; root = new Entity();
      update() {} render() {} destroy = modelIO.destroy;
    },
    Asset: class extends EventEmitter {
      id = ++modelIO.nextId;
      resource = { instantiateRenderEntity: () => { modelIO.instantiate(this.id); return new Entity(); } };
      unload = vi.fn();
    },
  };
});
import { ThreeStudio } from '../packages/studios/three';

describe('3D model resource lifecycle', () => {
  let studio: ThreeStudio;
  beforeEach(() => {
    vi.clearAllMocks(); modelIO.nextId = 0;
    vi.stubGlobal('document', { createElement: () => ({}) });
    modelIO.load.mockImplementation(asset => queueMicrotask(() => asset.emit('load')));
    studio = new ThreeStudio();
  });
  afterEach(() => { studio.dispose(); vi.unstubAllGlobals(); });
  const modelScene = () => {
    const shot = structuredClone(sample.shots[0]); shot.studio = 'three';
    shot.objects3d = [object3dSchema.parse({ id: 'object', name: '模型', shape: 'model', assetId: 'model' })];
    const assets = [mediaSchema.parse({ id: 'model', name: '模型', category: 'models', src: 'data:model/gltf-binary;base64,YQ==' })];
    return { shot, assets };
  };

  it('shares concurrent model downloads and clears failed attempts before retry', async () => {
    const { shot, assets } = modelScene();
    modelIO.load.mockImplementationOnce(asset => queueMicrotask(() => asset.emit('error', 'bad model')));
    await expect(Promise.all([studio.prepare(shot, assets), studio.prepare(shot, assets)])).rejects.toThrow('模型加载失败');
    expect(modelIO.load).toHaveBeenCalledTimes(1);
    expect(modelIO.remove).toHaveBeenCalledTimes(1);
    expect(studio.isPrepared(shot, assets)).toBe(false);
    await Promise.all([studio.prepare(shot, assets), studio.prepare(shot, assets)]);
    expect(modelIO.load).toHaveBeenCalledTimes(2);
    expect(studio.isPrepared(shot, assets)).toBe(true);
  });

  it('rebuilds when an unchanged object uses a different already cached model', async () => {
    const { shot, assets } = modelScene();
    await studio.prepare(shot, assets); studio.render(shot, 0);
    expect(modelIO.instantiate).toHaveBeenLastCalledWith(1);
    const other = [{ ...assets[0], src: 'data:model/gltf-binary;base64,Yg==' }];
    await studio.prepare(shot, other); studio.render(shot, 0);
    expect(modelIO.instantiate).toHaveBeenLastCalledWith(2);
    // Both URLs are cached, so isPrepared does not call prepare again.
    expect(studio.isPrepared(shot, assets)).toBe(true); studio.render(shot, 0);
    expect(modelIO.instantiate).toHaveBeenLastCalledWith(1);
    expect(modelIO.instantiate).toHaveBeenCalledTimes(3);
  });

  it('settles pending loads when closing the renderer instead of leaving them hanging', async () => {
    const { shot, assets } = modelScene(); modelIO.load.mockImplementation(() => {});
    const preparing = studio.prepare(shot, assets);
    await vi.waitFor(() => expect(modelIO.load).toHaveBeenCalledTimes(1));
    studio.dispose();
    await expect(preparing).rejects.toThrow('影棚已关闭');
    await expect(studio.prepare(shot, assets)).rejects.toThrow('影棚已关闭');
    studio.dispose(); expect(modelIO.destroy).toHaveBeenCalledTimes(1);
    expect(modelIO.remove).toHaveBeenCalledTimes(1);
  });
});
