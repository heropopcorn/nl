// Return mutable reference holders, not copies. All persistence/cleanup/package
// paths must include production drafts as well as assets placed in scenes.
export function mediaReferences(project) {
  return [
    ...(project.assets ?? []),
    ...(project.spriteDrafts ?? []).flatMap(draft => [draft.source, ...draft.frames, ...(draft.output ? [draft.output] : [])]),
  ];
}
