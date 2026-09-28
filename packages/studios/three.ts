import * as pc from 'playcanvas';
import type { Shot } from '../core';
import type { MediaAsset } from '../core/media';
export class ThreeStudio {
  canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
  app = new pc.Application(this.canvas, { graphicsDeviceOptions: { preserveDrawingBuffer: true, antialias: true } });
  camera = new pc.Entity('Camera');
  world = new pc.Entity('World');
  materials: pc.StandardMaterial[] = [];
  signature = '';
  models = new Map<string, pc.Asset>();
  isPrepared(shot: Shot, assets: MediaAsset[]) { this.currentAssets = assets; return shot.objects3d.filter(o => o.shape === 'model').every(o => { const a = assets.find(a => a.id === o.assetId); return !!a && this.models.has(a.src); }); }
  currentAssets: MediaAsset[] = [];
  async prepare(shot: Shot, assets: MediaAsset[]) {
    this.currentAssets = assets;
    for (const object of shot.objects3d.filter(o => o.shape === 'model')) {
      const media = assets.find(a => a.id === object.assetId); if (!media) throw new Error(`模型资源缺失：${object.name}`);
      if (!this.models.has(media.src)) {
        const asset = new pc.Asset(media.name, 'container', { url: media.src, filename: 'model.glb' });
        await new Promise<void>((resolve, reject) => { asset.ready(() => resolve()); asset.once('error', reject); this.app.assets.add(asset); this.app.assets.load(asset); });
        this.models.set(media.src, asset); this.signature = '';
      }
    }
  }
  constructor() {
    this.app.autoRender = false;
    this.app.scene.ambientLight = new pc.Color(0.5, 0.5, 0.5);
    this.camera.addComponent('camera', { clearColor: new pc.Color(0.07, 0.1, 0.15) });
    this.app.root.addChild(this.camera); this.app.root.addChild(this.world);
    const light = new pc.Entity('Sun'); light.addComponent('light', { type: 'directional', intensity: 1.5 }); light.setEulerAngles(45, 30, 0); this.app.root.addChild(light);
  }
  render(shot: Shot, frame: number) {
    const signature = JSON.stringify(shot.objects3d);
    if (signature !== this.signature) {
      [...this.world.children].forEach(c => c.destroy()); this.materials.forEach(m => m.destroy()); this.materials = [];
      for (const object of shot.objects3d) {
        if (object.shape === 'model') {
          const media = this.currentAssets.find(a => a.id === object.assetId)!;
          const entity = (this.models.get(media.src)!.resource as pc.ContainerResource).instantiateRenderEntity();
          entity.name = object.id; entity.setPosition(object.x, object.y, object.z); entity.setLocalScale(object.scale, object.scale, object.scale); this.world.addChild(entity); continue;
        }
        const entity = new pc.Entity(object.id, this.app); const material = new pc.StandardMaterial();
        material.diffuse = new pc.Color().fromString(object.color); material.update(); this.materials.push(material);
        entity.addComponent('render', { type: object.shape, material });
        entity.setPosition(object.x, object.y, object.z); entity.setLocalScale(object.scale, object.scale, object.scale); this.world.addChild(entity);
      }
      this.signature = signature;
    }
    shot.objects3d.forEach((object, i) => this.world.children[i].setEulerAngles(0, object.rotation + object.spin * frame / 30, 0));
    const c = shot.camera3d; this.camera.setPosition(c.x, c.y, c.z); this.camera.lookAt(0, c.targetY, 0); this.camera.camera!.fov = c.fov;
    this.app.update(0); this.app.render(); return this.canvas;
  }
  dispose() { this.app.destroy(); }
}
