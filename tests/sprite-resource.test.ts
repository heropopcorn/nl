import { describe, it, expect } from 'vitest';
import { projectSchema, sample } from '../packages/core';
import { mediaSchema } from '../packages/core/media';
import { spriteFrame } from '../packages/core/sprite-frame';
import { layoutSpritesheet } from '../packages/spritesheet/spritePack';
import { DEFAULT_PACK_SETTINGS } from '../packages/spritesheet/spriteFrames';

describe('custom sprite resources', () => {
  it('migrates old projects without categories and validates folder references', () => {
    const { resourceCategories, ...old } = sample;
    expect(projectSchema.parse(old).resourceCategories).toEqual([]);
    const asset = mediaSchema.parse({ id: 'sprite', name: '动作', category: 'characters', src: '/art/player.png', customCategoryId: 'actions' });
    expect(projectSchema.safeParse({ ...old, assets: [asset] }).success).toBe(false);
    expect(projectSchema.parse({ ...old, resourceCategories: [{ id: 'actions', name: '动作' }], assets: [asset] }).assets[0].customCategoryId).toBe('actions');
    expect(projectSchema.safeParse({ ...old, resourceCategories: [{id:'1',name:'动作'},{id:'2',name:'动作'}] }).success).toBe(false);
  });
  it('uses exact frame rectangles and never plays empty trailing cells', () => {
    const rects = [{x:0,y:0,width:10,height:10},{x:12,y:0,width:10,height:10},{x:0,y:12,width:10,height:10}];
    const asset = mediaSchema.parse({id:'s',name:'s',category:'characters',src:'/art/player.png',width:22,height:22,columns:2,rows:2,fps:30,frameRects:rects});
    expect(spriteFrame(asset,22,22,2)).toEqual(rects[2]);
    expect(spriteFrame(asset,22,22,3)).toEqual(rects[0]);
    expect(mediaSchema.safeParse({...asset, frameRects:[{x:20,y:0,width:10,height:10}]}).success).toBe(false);
  });
  it('blocks oversized atlas allocation', () => {
    expect(() => layoutSpritesheet([{id:'f',index:0,time:0,enabled:true,width:2048,height:2048}], {...DEFAULT_PACK_SETTINGS, columns:64})).toThrow('图集过大');
  });
});
