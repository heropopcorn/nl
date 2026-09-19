# Bugfix: 新建场景总挂到第一章

Repo: /workspace/yuanli-game-video (heropopcorn/nl). Work on a new branch off latest main, e.g. `codex/fix-new-scene-chapter`. Do NOT push secrets. Open a PR when done.

## Symptom
User selects another chapter (左栏「展开 章节名」), then clicks「新建场景」, but the new scene always appears under the first chapter.

## Likely cause (verify, do not assume blindly)
Hypothesis to verify:
1. `_open_new_dialog` sets `repo.set_active_chapter_id(selected_chapter_id)`.
2. `_confirm_new_scene` calls `_flush_save()` first.
3. `save_scene` → `_upsert_index_entry` for the *currently open* scene sets `index["active_chapter_id"]` back to that open scene's chapter.
4. `create_*_scene` / `_upsert_index_entry` for the *new* scene then uses the overwritten `active_chapter_id` (often chapter 1).

Also check UX: chapter selection may be unclear; ensure selected chapter stays highlighted and new scenes go there.

## Required fix
1. Creating a scene must use the chapter the user selected (`selected_chapter_id` / intended chapter), not get overwritten by autosave of another scene.
2. Saving an existing scene must **not** change `active_chapter_id` away from the user's chapter selection (or pass explicit `chapter_id` into create).
3. Prefer: `create_preset_scene` / `create_blank_scene` / `create_uploaded_scene` (or `_create_with_background`) accept an optional `chapter_id`; `_confirm_new_scene` passes `selected_chapter_id` after ensuring it is set.
4. `_upsert_index_entry` for updates should preserve scene chapter_id but should not clobber `active_chapter_id` unless intentionally opening/creating; or restore selected chapter after flush.
5. Update usage.md if needed (one short note: 先点「展开」选中章节再新建).
6. Add/extend headless selftest covering: select chapter B while scene in chapter A is open → create scene → assert new scene's index `chapter_id` is B.
7. Run relevant Godot selftest if available; at least run the director desk selftest path used in this repo.
8. Commit, push branch, open PR. Report PR URL + short summary.

## Constraints
- Chinese UI labels stay Chinese.
- Minimal focused fix; no unrelated refactors.
- Web export not required unless you touch export config.
