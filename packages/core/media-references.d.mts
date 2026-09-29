export function mediaReferences(project: {
  assets?: { src: string }[];
  spriteDrafts?: { source: { src: string }; frames: { src: string }[]; output: { src: string } | null }[];
}): { src: string }[];
