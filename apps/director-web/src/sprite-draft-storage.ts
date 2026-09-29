import { spriteDraftSchema, type SpriteDraft } from '../../../packages/core/sprite-draft';
import { assertVideoFile, frameMeta, MAX_VIDEO_BYTES, revokeFrameUrls, type SpriteFrame, type SpriteExtractSettings, type SpritePackSettings } from '../../../packages/spritesheet/spriteFrames';
import { layoutSpritesheet, spritesheetJson } from '../../../packages/spritesheet/spritePack';
import { checkWorkspaceResponse, uploadWorkspaceMedia, workspaceDirectory } from './workspace-storage';

type Packed = { blob: Blob; url: string; layout: ReturnType<typeof layoutSpritesheet>; json: ReturnType<typeof spritesheetJson> };
export type SpriteWork = {
  name: string; video: File | null; frames: SpriteFrame[]; extract: SpriteExtractSettings;
  pack: SpritePackSettings; threshold: number; crop: boolean; fps: number; packed: Packed | null;
};
const cached = new WeakMap<Blob, { directory: string; src: string }>();
const dummy = '/api/workspace/media/' + '0'.repeat(64);
function videoType(file: File): SpriteDraft['source']['type'] {
  const types: Record<string, SpriteDraft['source']['type']> = {mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime',mkv:'video/x-matroska'};
  const type = types[file.name.split('.').pop()!.toLowerCase()];
  if (!type) throw new Error('本地视频草稿支持 MP4、WebM、MOV、M4V、MKV；能否抽帧取决于浏览器解码器');
  return type;
}
async function store(blob: Blob, type = blob.type) {
  const old = cached.get(blob), directory = workspaceDirectory();
  if (old?.directory === directory) return old.src;
  const src = await uploadWorkspaceMedia(blob.type === type ? blob : new Blob([blob], {type}));
  cached.set(blob, {directory, src}); return src;
}
export async function storeSpriteDraft(work: SpriteWork, id: string, categoryId: string): Promise<SpriteDraft> {
  if (!work.video) throw new Error('请先选择本地视频');
  assertVideoFile(work.video);
  if (!work.video.size) throw new Error('视频文件为空');
  const type = videoType(work.video);
  // Validate all metadata before uploading. No blob URLs/base64 enter project.json.
  const draft = spriteDraftSchema.parse({
    id, version:1, name:work.name.trim(), categoryId, updatedAt:Date.now(),
    source:{src:dummy+'.mp4', name:work.video.name, type},
    frames:work.frames.map(f=>({...frameMeta(f),src:dummy+'.png'})),
    extract:work.extract, pack:work.pack, threshold:work.threshold, crop:work.crop, fps:work.fps,
    output:work.packed ? {src:dummy+'.png'} : null,
  });
  draft.source.src = await store(work.video, type);
  // Bounded, sequential uploads keep memory/network use predictable.
  for (let i=0;i<work.frames.length;i++) draft.frames[i].src = await store(work.frames[i].blob, 'image/png');
  if (draft.output && work.packed) draft.output.src = await store(work.packed.blob, 'image/png');
  return spriteDraftSchema.parse(draft);
}
async function readBlob(src: string, limit: number) {
  const res = await checkWorkspaceResponse(await fetch(src), true);
  if (Number(res.headers.get('content-length')) > limit) {await res.body?.cancel(); throw new Error('制作文件超过读取上限');}
  const blob = await res.blob();
  if (!blob.size || blob.size > limit) throw new Error('制作文件为空或超过读取上限');
  cached.set(blob, {directory:workspaceDirectory(),src}); return blob;
}
export async function readSpriteDraft(value: SpriteDraft): Promise<SpriteWork> {
  const draft = spriteDraftSchema.parse(value), frames: SpriteFrame[] = [];
  let packed: Packed | null = null;
  try {
    const blob = await readBlob(draft.source.src, MAX_VIDEO_BYTES);
    const video = new File([blob],draft.source.name,{type:draft.source.type});
    cached.set(video,{directory:workspaceDirectory(),src:draft.source.src});
    let pixels=0;
    for (const f of draft.frames) {
      pixels += f.width*f.height;
      if (pixels>67_108_864) throw new Error('草稿帧像素总量过大，请减少帧数');
      const blob = await readBlob(f.src, 32*1024*1024);
      frames.push({...f,blob,previewUrl:URL.createObjectURL(blob)});
    }
    if (draft.output) {
      const blob = await readBlob(draft.output.src, 80*1024*1024), layout = layoutSpritesheet(frames,draft.pack);
      packed = {blob,url:URL.createObjectURL(blob),layout,json:spritesheetJson(layout)};
    }
    return {name:draft.name,video,frames,extract:draft.extract,pack:draft.pack,threshold:draft.threshold,crop:draft.crop,fps:draft.fps,packed};
  } catch (e) {revokeFrameUrls(frames); if(packed) URL.revokeObjectURL(packed.url); throw e;}
}
