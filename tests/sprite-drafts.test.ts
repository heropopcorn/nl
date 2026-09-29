import { expect, test } from 'vitest';
import { projectSchema, sample } from '../packages/core';
import { spriteDraftSchema } from '../packages/core/sprite-draft';
import { mediaReferences } from '../packages/core/media-references.mjs';
import { DEFAULT_EXTRACT_SETTINGS, DEFAULT_PACK_SETTINGS } from '../packages/spritesheet/spriteFrames';

const src = '/api/workspace/media/'+'a'.repeat(64);
const draft = () => spriteDraftSchema.parse({id:'a6c7df0e-e8d8-46af-b4b5-9bfbd56d4bc2', version:1, name:'走路',categoryId:'',updatedAt:1,
  source:{src:src+'.mp4',name:'walk.mp4',type:'video/mp4'},
  frames:[{id:'first',index:0,time:0,enabled:true,cutout:true,width:32,height:32,src:src+'.png'}],
  extract:DEFAULT_EXTRACT_SETTINGS,pack:DEFAULT_PACK_SETTINGS,threshold:38,crop:false,fps:12,output:{src:src+'.png'},
});
test('old projects gain empty drafts and all draft media references are visited mutably',()=>{
  const {spriteDrafts:_, ...old}=sample;
  expect(projectSchema.parse(old).spriteDrafts).toEqual([]);
  const p=structuredClone(sample); p.spriteDrafts.push(draft());
  const refs=mediaReferences(p); expect(refs).toHaveLength(3);
  refs[0].src='media/original.mp4'; expect(p.spriteDrafts[0].source.src).toBe('media/original.mp4');
});
test('draft validation rejects traversal, remote/video URLs in frames and duplicate IDs',()=>{
  const d=draft(); d.source.src='media/../../secret.mp4'; expect(spriteDraftSchema.safeParse(d).success).toBe(false);
  for(const bad of ['https://example.com/frame.png',src+'.mp4','blob:temporary']) {
    const d=draft();d.frames[0].src=bad;expect(spriteDraftSchema.safeParse(d).success).toBe(false);
  }
  const p=structuredClone(sample);p.spriteDrafts=[draft(),draft()];expect(projectSchema.safeParse(p).success).toBe(false);
  const duplicate=draft();duplicate.frames.push({...duplicate.frames[0]});expect(spriteDraftSchema.safeParse(duplicate).success).toBe(false);
});
