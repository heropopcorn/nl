class_name SceneRepository
extends RefCounted

## user://director_desk persistence: index, scene CRUD, atomic writes, v1 migrate.
## Never writes into res://art/approved/ or codex/asset-gen/.

const DEFAULT_ROOT := "user://director_desk/"
const INDEX_SCHEMA := 2
const DEFAULT_CHAPTER_NAME := "第一章"
const V1_JSON := "user://scene_layout.json"
const V1_GROUND := "user://custom_ground.png"
const V1_WATER := "user://water_mask.png"
const MIGRATED_NAME := "从旧版导入"
const EXAMPLE_NAME := "示例村庄"

var root: String = DEFAULT_ROOT
var v1_json_path: String = V1_JSON
var v1_ground_path: String = V1_GROUND
var v1_water_path: String = V1_WATER

var last_error: String = ""
var last_warning: String = ""
var recovered_from_backup: bool = false


func _init(p_root: String = DEFAULT_ROOT) -> void:
	root = p_root
	if not root.ends_with("/"):
		root += "/"


func ensure_root() -> void:
	DirAccess.make_dir_recursive_absolute(_abs(root))
	DirAccess.make_dir_recursive_absolute(_abs(_scenes_dir()))


func scenes_dir() -> String:
	return _scenes_dir()


func scene_dir(scene_id: String) -> String:
	return _scenes_dir() + scene_id + "/"


func index_path() -> String:
	return root + "index.json"


func list_entries(chapter_id: String = "") -> Array[Dictionary]:
	var index := load_or_rebuild_index()
	var entries: Array[Dictionary] = []
	var raw: Variant = index.get("scenes", [])
	if raw is Array:
		for item in raw:
			if item is Dictionary and (chapter_id.is_empty() or str(item.get("chapter_id", "")) == chapter_id):
				entries.append(item)
	entries.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("order", 0)) < int(b.get("order", 0))
	)
	return entries


func list_chapters() -> Array[Dictionary]:
	var index := load_or_rebuild_index()
	var result: Array[Dictionary] = []
	for item in index.get("chapters", []):
		if item is Dictionary:
			result.append(item)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("order", 0)) < int(b.get("order", 0)))
	return result


func active_chapter_id() -> String:
	return str(load_or_rebuild_index().get("active_chapter_id", ""))


func set_active_chapter_id(chapter_id: String) -> void:
	var index := load_or_rebuild_index()
	if _chapter_exists(index, chapter_id):
		index["active_chapter_id"] = chapter_id
		_write_index(index)


func chapter_for_scene(scene_id: String) -> String:
	for item in load_or_rebuild_index().get("scenes", []):
		if item is Dictionary and str(item.get("id", "")) == scene_id:
			return str(item.get("chapter_id", ""))
	return ""


func active_scene_id() -> String:
	var index := load_or_rebuild_index()
	return str(index.get("active_scene_id", ""))


func set_active_scene_id(scene_id: String) -> void:
	var index := load_or_rebuild_index()
	index["active_scene_id"] = scene_id
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("id", "")) == scene_id:
			index["active_chapter_id"] = str(item.get("chapter_id", index.get("active_chapter_id", "")))
	_write_index(index)


func load_or_rebuild_index() -> Dictionary:
	ensure_root()
	var path := index_path()
	if FileAccess.file_exists(path):
		var parsed := _read_json_dict(path)
		if not parsed.is_empty() and parsed.get("scenes", []) is Array:
			var normalized := _normalize_index(parsed)
			if int(parsed.get("schema_version", 1)) != INDEX_SCHEMA or not parsed.has("chapters"):
				_write_index(normalized)
			return normalized
		print("director repo: index unreadable, rebuilding")
	return rebuild_index()


func rebuild_index() -> Dictionary:
	ensure_root()
	var scenes: Array = []
	var dir := DirAccess.open(_scenes_dir())
	if dir:
		dir.list_dir_begin()
		var entry := dir.get_next()
		while entry != "":
			if entry != "." and entry != ".." and dir.current_is_dir() and entry.begins_with("scn_"):
				var model := load_scene(entry)
				if model and not model.parse_failed and not model.scene_id.is_empty():
					scenes.append(_index_entry_for(model))
			entry = dir.get_next()
		dir.list_dir_end()
	scenes.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.get("updated_at", "")) < str(b.get("updated_at", "")))
	var chapter_id := _new_chapter_id()
	for i in range(scenes.size()):
		scenes[i]["chapter_id"] = chapter_id
		scenes[i]["order"] = i
	var active := ""
	if not scenes.is_empty():
		active = str(scenes[0].get("id", ""))
	var index := {
		"schema_version": INDEX_SCHEMA,
		"active_scene_id": active,
		"active_chapter_id": chapter_id,
		"chapters": [{"id": chapter_id, "name": DEFAULT_CHAPTER_NAME, "order": 0}],
		"scenes": scenes,
	}
	_write_index(index)
	return index


func create_chapter(chapter_name: String) -> String:
	last_error = ""
	var trimmed := chapter_name.strip_edges()
	if trimmed.length() < 1 or trimmed.length() > 40:
		last_error = "章节名称须为 1–40 个字符"
		return ""
	var index := load_or_rebuild_index()
	var id := _new_chapter_id()
	index["chapters"].append({"id": id, "name": trimmed, "order": index["chapters"].size()})
	index["active_chapter_id"] = id
	_write_index(index)
	return id


func rename_chapter(chapter_id: String, chapter_name: String) -> bool:
	var trimmed := chapter_name.strip_edges()
	if trimmed.length() < 1 or trimmed.length() > 40:
		last_error = "章节名称须为 1–40 个字符"
		return false
	var index := load_or_rebuild_index()
	for chapter in index.get("chapters", []):
		if chapter is Dictionary and str(chapter.get("id", "")) == chapter_id:
			chapter["name"] = trimmed
			return _write_index(index)
	last_error = "找不到章节"
	return false


func delete_chapter(chapter_id: String) -> bool:
	var index := load_or_rebuild_index()
	if index.get("chapters", []).size() <= 1:
		last_error = "至少保留一个章节"
		return false
	var scene_ids: Array[String] = []
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("chapter_id", "")) == chapter_id:
			scene_ids.append(str(item.get("id", "")))
	for scene_id in scene_ids:
		var dir_path := scene_dir(scene_id)
		if DirAccess.dir_exists_absolute(_abs(dir_path)):
			_remove_dir_recursive(dir_path)
	var chapters: Array = []
	for chapter in index.get("chapters", []):
		if chapter is Dictionary and str(chapter.get("id", "")) != chapter_id:
			chapters.append(chapter)
	var scenes: Array = []
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("chapter_id", "")) != chapter_id:
			scenes.append(item)
	index["chapters"] = chapters
	index["scenes"] = scenes
	_normalize_orders(index)
	index["active_chapter_id"] = str(chapters[0].get("id", ""))
	if str(index.get("active_scene_id", "")) in scene_ids:
		index["active_scene_id"] = _first_scene_id(index, str(index["active_chapter_id"]))
	return _write_index(index)


func move_chapter(chapter_id: String, delta: int) -> bool:
	var index := load_or_rebuild_index()
	var chapters: Array = index.get("chapters", [])
	var at := _find_by_id(chapters, chapter_id)
	var target := clampi(at + delta, 0, chapters.size() - 1)
	if at < 0 or at == target:
		return false
	var value: Variant = chapters[at]
	chapters.remove_at(at)
	chapters.insert(target, value)
	for i in range(chapters.size()):
		chapters[i]["order"] = i
	index["chapters"] = chapters
	_normalize_orders(index)
	return _write_index(index)


func move_scene(scene_id: String, delta: int) -> bool:
	var index := load_or_rebuild_index()
	var chapter_id := chapter_for_scene(scene_id)
	var ordered: Array = []
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("chapter_id", "")) == chapter_id:
			ordered.append(item)
	ordered.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("order", 0)) < int(b.get("order", 0)))
	var at := _find_by_id(ordered, scene_id)
	var target := clampi(at + delta, 0, ordered.size() - 1)
	if at < 0 or at == target:
		return false
	var value: Variant = ordered[at]
	ordered.remove_at(at)
	ordered.insert(target, value)
	for i in range(ordered.size()):
		ordered[i]["order"] = i
	return _write_index(index)


func load_scene(scene_id: String) -> DirectorSceneModel:
	last_error = ""
	last_warning = ""
	recovered_from_backup = false
	if not _valid_scene_id(scene_id):
		last_error = "场景 ID 格式无效"
		return null
	var json_path := scene_dir(scene_id) + "scene.json"
	var bak_path := scene_dir(scene_id) + "scene.json.bak"
	var model := _load_scene_file(json_path)
	if model and _scene_usable(model):
		if model.scene_id != scene_id:
			model.errors.append("场景 ID 与目录名不一致")
		return model
	if FileAccess.file_exists(bak_path):
		var bak := _load_scene_file(bak_path)
		if bak and _scene_usable(bak):
			recovered_from_backup = true
			last_warning = "已从备份恢复"
			print("director repo: recovered %s from backup" % scene_id)
			return bak
	if model:
		last_error = model.errors[0] if not model.errors.is_empty() else "无法解析场景文件"
		return model
	last_error = "无法解析场景文件"
	return null


func save_scene(model: DirectorSceneModel, background_image: Image = null, thumbnail_image: Image = null) -> bool:
	last_error = ""
	if model == null:
		last_error = "无法解析场景文件"
		return false
	model.validate()
	if not model.is_valid():
		last_error = model.errors[0] if not model.errors.is_empty() else "保存失败"
		return false
	if not _valid_scene_id(model.scene_id):
		last_error = "场景 ID 格式无效"
		return false
	ensure_root()
	var dir_path := scene_dir(model.scene_id)
	DirAccess.make_dir_recursive_absolute(_abs(dir_path))
	if background_image:
		var bg_path := dir_path + "background.png"
		if background_image.save_png(bg_path) != OK:
			last_error = "保存失败"
			return false
		model.background["file"] = "background.png"
		var stored := FileAccess.get_file_as_bytes(bg_path)
		if not stored.is_empty():
			model.background["sha256"] = DirectorImages.sha256_bytes(stored)
			model.background["pixel_size"] = [background_image.get_width(), background_image.get_height()]
	if thumbnail_image:
		thumbnail_image.save_png(dir_path + "thumbnail.png")
	elif background_image:
		DirectorImages.make_thumbnail(background_image).save_png(dir_path + "thumbnail.png")
	model.touch_updated()
	model.validate()
	if not model.is_valid():
		last_error = model.errors[0] if not model.errors.is_empty() else "保存失败"
		return false
	var json_path := dir_path + "scene.json"
	if not _atomic_write_text(json_path, model.to_json_text()):
		last_error = "保存失败"
		return false
	_upsert_index_entry(model)
	return true


func create_preset_scene(p_name: String) -> DirectorSceneModel:
	var bg := {
		"source": "preset",
		"preset_id": DirectorSceneModel.PRESET_VILLAGE,
		"file": null,
		"pixel_size": [DirectorSceneModel.PRESET_PIXEL.x, DirectorSceneModel.PRESET_PIXEL.y],
	}
	return _create_with_background(p_name, bg, null)


func create_blank_scene(p_name: String) -> DirectorSceneModel:
	var image := DirectorImages.make_blank(DirectorSceneModel.BLANK_PIXEL, DirectorSceneModel.BLANK_FILL)
	var bg := {
		"source": "blank",
		"preset_id": null,
		"file": "background.png",
		"fill_color": DirectorSceneModel.color_to_arr(DirectorSceneModel.BLANK_FILL),
		"pixel_size": [image.get_width(), image.get_height()],
	}
	return _create_with_background(p_name, bg, image)


func create_uploaded_scene(p_name: String, bytes: PackedByteArray, original_name: String) -> DirectorSceneModel:
	last_error = ""
	last_warning = ""
	var decoded := DirectorImages.decode_upload(bytes)
	if not bool(decoded["ok"]):
		last_error = str(decoded.get("error", "无法解码图片"))
		return null
	last_warning = str(decoded.get("warning", ""))
	var image: Image = decoded["image"]
	var bg := {
		"source": "uploaded",
		"preset_id": null,
		"file": "background.png",
		"original_file_name": original_name.get_file(),
		"pixel_size": [image.get_width(), image.get_height()],
		"sha256": DirectorImages.sha256_bytes(DirectorImages.png_bytes(image)),
	}
	return _create_with_background(p_name, bg, image)


func rename_scene(scene_id: String, new_name: String) -> bool:
	var model := load_scene(scene_id)
	if model == null or model.parse_failed:
		return false
	model.name = new_name.strip_edges()
	return save_scene(model)


func delete_scene(scene_id: String) -> bool:
	if not _valid_scene_id(scene_id):
		last_error = "场景 ID 格式无效"
		return false
	var dir_path := scene_dir(scene_id)
	if DirAccess.dir_exists_absolute(_abs(dir_path)):
		_remove_dir_recursive(dir_path)
	var index := load_or_rebuild_index()
	var next: Array = []
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("id", "")) != scene_id:
			next.append(item)
	index["scenes"] = next
	if str(index.get("active_scene_id", "")) == scene_id:
		index["active_scene_id"] = str(next[0]["id"]) if not next.is_empty() else ""
	_normalize_orders(index)
	_write_index(index)
	return true


func resolve_scene_file(scene_id: String, relative: String) -> String:
	if not _valid_scene_id(scene_id):
		return ""
	if relative.is_empty() or not DirectorSceneModel._is_safe_relative_file(relative):
		return ""
	var base := scene_dir(scene_id)
	var resolved := (base + relative).simplify_path()
	var abs_base := _abs(base).simplify_path()
	var abs_res := _abs(resolved).simplify_path()
	if not abs_res.begins_with(abs_base):
		return ""
	return resolved


func maybe_migrate_v1() -> DirectorSceneModel:
	ensure_root()
	if FileAccess.file_exists(index_path()):
		return null
	if not FileAccess.file_exists(v1_json_path):
		return null
	print("director repo: migrating v1 scene_layout.json")
	var layout := SceneLayout.new()
	var file := FileAccess.open(v1_json_path, FileAccess.READ)
	if file == null:
		last_error = "无法解析场景文件"
		return null
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		last_error = "无法解析场景文件"
		return null
	layout.from_dict(parsed as Dictionary)
	var data: Dictionary = parsed
	layout.has_custom_ground = str(data.get("ground", "")).begins_with("user://") and FileAccess.file_exists(v1_ground_path)
	layout.has_custom_water = str(data.get("water_mask", "")).begins_with("user://") and FileAccess.file_exists(v1_water_path)
	var scene_id := DirectorSceneModel.new_scene_id()
	var bg := {}
	var bg_image: Image = null
	if layout.has_custom_ground and FileAccess.file_exists(v1_ground_path):
		bg_image = _load_png(v1_ground_path)
		if bg_image == null:
			last_error = "无法解码图片"
			return null
		bg = {
			"source": "uploaded",
			"preset_id": null,
			"file": "background.png",
			"original_file_name": "custom_ground.png",
			"pixel_size": [bg_image.get_width(), bg_image.get_height()],
		}
	else:
		bg = {
			"source": "preset",
			"preset_id": DirectorSceneModel.PRESET_VILLAGE,
			"file": null,
			"pixel_size": [DirectorSceneModel.PRESET_PIXEL.x, DirectorSceneModel.PRESET_PIXEL.y],
		}
	var model := DirectorSceneModel.make_new(scene_id, MIGRATED_NAME, bg)
	model.editor["show_baked_props"] = not layout.hide_baked_props
	var points: Array = []
	for point in layout.path_uv:
		points.append(DirectorSceneModel.vec2_to_arr(point))
	var start := DirectorSceneModel.DEFAULT_START_UV
	if layout.path_uv.size() > 0:
		start = layout.path_uv[0]
	var actor := {
		"id": DirectorSceneModel.new_hex_id("actor_", 4),
		"character_id": "farmer_placeholder",
		"display_name": "主角",
		"enabled": true,
		"start_uv": DirectorSceneModel.vec2_to_arr(start),
		"route": {
			"points_uv": points,
			"speed_px_per_sec": DirectorSceneModel.ACTOR_SPEED_DEFAULT,
			"loop": layout.path_loop,
			"collision_mode": "ignore" if layout.path_ignore_collision else "world",
		},
	}
	model.actors.clear()
	model.actors.append(actor)
	if layout.has_custom_water and FileAccess.file_exists(v1_water_path):
		var dir_path := scene_dir(scene_id)
		DirAccess.make_dir_recursive_absolute(_abs(dir_path))
		if not _copy_file(v1_water_path, dir_path + "legacy_water_mask.png"):
			last_error = "保存失败"
			return null
		model.legacy_water = {
			"mask": "legacy_water_mask.png",
			"flow_dir": [layout.water_flow_dir.x, layout.water_flow_dir.y],
			"readonly": true,
		}
	model.validate()
	if not save_scene(model, bg_image, bg_image):
		return null
	# Original v1 files stay in place.
	if FileAccess.file_exists(v1_json_path) == false:
		last_error = "迁移后旧文件丢失"
		return null
	set_active_scene_id(model.scene_id)
	return model


func ensure_example_if_empty() -> DirectorSceneModel:
	var entries := list_entries()
	if not entries.is_empty():
		return null
	return create_preset_scene(EXAMPLE_NAME)


func _create_with_background(p_name: String, background: Dictionary, image: Image) -> DirectorSceneModel:
	last_error = ""
	var trimmed := p_name.strip_edges()
	if trimmed.length() < DirectorSceneModel.NAME_MIN or trimmed.length() > DirectorSceneModel.NAME_MAX:
		last_error = "场景名称须为 1–40 个字符"
		return null
	var scene_id := DirectorSceneModel.new_scene_id()
	while DirAccess.dir_exists_absolute(_abs(scene_dir(scene_id))):
		scene_id = DirectorSceneModel.new_scene_id()
	var model := DirectorSceneModel.make_new(scene_id, trimmed, background)
	if not save_scene(model, image, image):
		_remove_dir_recursive(scene_dir(scene_id))
		return null
	set_active_scene_id(model.scene_id)
	return model


func _load_scene_file(path: String) -> DirectorSceneModel:
	if not FileAccess.file_exists(path):
		return null
	var text := FileAccess.get_file_as_string(path)
	return DirectorSceneModel.from_json_text(text)


func _index_entry_for(model: DirectorSceneModel) -> Dictionary:
	var thumb := "scenes/%s/thumbnail.png" % model.scene_id
	if not FileAccess.file_exists(scene_dir(model.scene_id) + "thumbnail.png"):
		thumb = ""
	return {
		"id": model.scene_id,
		"name": model.name,
		"updated_at": model.updated_at,
		"thumbnail": thumb,
		"chapter_id": "",
		"order": 0,
	}


func _upsert_index_entry(model: DirectorSceneModel) -> void:
	var index := load_or_rebuild_index()
	var scenes: Array = []
	var replaced := false
	var target_chapter_id := str(index.get("active_chapter_id", ""))
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("id", "")) == model.scene_id:
			var replacement := _index_entry_for(model)
			replacement["chapter_id"] = str(item.get("chapter_id", index.get("active_chapter_id", "")))
			replacement["order"] = int(item.get("order", 0))
			scenes.append(replacement)
			target_chapter_id = str(replacement["chapter_id"])
			replaced = true
		elif item is Dictionary:
			scenes.append(item)
	if not replaced:
		var fresh := _index_entry_for(model)
		fresh["chapter_id"] = target_chapter_id
		fresh["order"] = _scene_count(index, target_chapter_id)
		scenes.append(fresh)
	index["scenes"] = scenes
	index["active_scene_id"] = model.scene_id
	index["active_chapter_id"] = target_chapter_id
	_write_index(index)


func _write_index(index: Dictionary) -> bool:
	index["schema_version"] = INDEX_SCHEMA
	index = _normalize_index(index)
	return _atomic_write_text(index_path(), JSON.stringify(index, "\t") + "\n")


func _normalize_index(source: Dictionary) -> Dictionary:
	var index := source.duplicate(true)
	var chapters: Array = []
	if index.get("chapters", []) is Array:
		for item in index.get("chapters", []):
			if item is Dictionary and not str(item.get("id", "")).is_empty():
				chapters.append(item)
	if chapters.is_empty():
		chapters.append({"id": _new_chapter_id(), "name": DEFAULT_CHAPTER_NAME, "order": 0})
	index["chapters"] = chapters
	var fallback := str(chapters[0].get("id", ""))
	var scenes: Array = []
	if index.get("scenes", []) is Array:
		for item in index.get("scenes", []):
			if item is Dictionary:
				if not _chapter_exists_in(chapters, str(item.get("chapter_id", ""))):
					item["chapter_id"] = fallback
				scenes.append(item)
	index["scenes"] = scenes
	if not _chapter_exists_in(chapters, str(index.get("active_chapter_id", ""))):
		index["active_chapter_id"] = fallback
	index["schema_version"] = INDEX_SCHEMA
	_normalize_orders(index)
	return index


func _normalize_orders(index: Dictionary) -> void:
	var chapters: Array = index.get("chapters", [])
	chapters.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("order", 0)) < int(b.get("order", 0)))
	for i in range(chapters.size()):
		chapters[i]["order"] = i
	for chapter in chapters:
		var cid := str(chapter.get("id", ""))
		var own: Array = []
		for item in index.get("scenes", []):
			if item is Dictionary and str(item.get("chapter_id", "")) == cid:
				own.append(item)
		own.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.get("order", 0)) < int(b.get("order", 0)))
		for i in range(own.size()):
			own[i]["order"] = i


func _chapter_exists(index: Dictionary, chapter_id: String) -> bool:
	return _chapter_exists_in(index.get("chapters", []), chapter_id)


func _chapter_exists_in(chapters: Array, chapter_id: String) -> bool:
	for chapter in chapters:
		if chapter is Dictionary and str(chapter.get("id", "")) == chapter_id:
			return true
	return false


func _new_chapter_id() -> String:
	return DirectorSceneModel.new_hex_id("ch_", 6)


func _find_by_id(items: Array, id: String) -> int:
	for i in range(items.size()):
		if items[i] is Dictionary and str(items[i].get("id", "")) == id:
			return i
	return -1


func _scene_count(index: Dictionary, chapter_id: String) -> int:
	var count := 0
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("chapter_id", "")) == chapter_id:
			count += 1
	return count


func _first_scene_id(index: Dictionary, chapter_id: String) -> String:
	var best: Dictionary = {}
	for item in index.get("scenes", []):
		if item is Dictionary and str(item.get("chapter_id", "")) == chapter_id:
			if best.is_empty() or int(item.get("order", 0)) < int(best.get("order", 0)):
				best = item
	return str(best.get("id", ""))


func _atomic_write_text(path: String, text: String) -> bool:
	var base := path.get_base_dir()
	DirAccess.make_dir_recursive_absolute(_abs(base))
	var tmp := path + ".tmp"
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		push_warning("director repo: cannot write %s" % tmp)
		return false
	file.store_string(text)
	file.flush()
	file.close()
	if FileAccess.file_exists(path):
		var bak := path + ".bak"
		var existing := FileAccess.get_file_as_bytes(path)
		var bak_file := FileAccess.open(bak, FileAccess.WRITE)
		if bak_file:
			bak_file.store_buffer(existing)
			bak_file.flush()
			bak_file.close()
		DirAccess.remove_absolute(_abs(path))
	var renamed := DirAccess.rename_absolute(_abs(tmp), _abs(path))
	if renamed != OK:
		# Fallback copy if rename fails across mounts.
		var bytes := FileAccess.get_file_as_bytes(tmp)
		var dest := FileAccess.open(path, FileAccess.WRITE)
		if dest == null:
			return false
		dest.store_buffer(bytes)
		dest.flush()
		dest.close()
		DirAccess.remove_absolute(_abs(tmp))
	return FileAccess.file_exists(path)


func _copy_file(src: String, dst: String) -> bool:
	var bytes := FileAccess.get_file_as_bytes(src)
	if bytes.is_empty() and FileAccess.get_file_as_bytes(src).size() == 0:
		# Allow empty files to fail; PNGs should not be empty.
		if not FileAccess.file_exists(src):
			return false
	var file := FileAccess.open(dst, FileAccess.WRITE)
	if file == null:
		return false
	file.store_buffer(bytes)
	file.flush()
	file.close()
	return FileAccess.file_exists(dst)


func _remove_dir_recursive(path: String) -> void:
	var abs_path := _abs(path)
	var dir := DirAccess.open(path)
	if dir == null:
		DirAccess.remove_absolute(abs_path)
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if entry != "." and entry != "..":
			var child := path.path_join(entry)
			if dir.current_is_dir():
				_remove_dir_recursive(child)
			else:
				DirAccess.remove_absolute(_abs(child))
		entry = dir.get_next()
	dir.list_dir_end()
	DirAccess.remove_absolute(abs_path)


func _load_png(path: String) -> Image:
	var image := Image.new()
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty() or image.load_png_from_buffer(bytes) != OK:
		return null
	if image.get_format() != Image.FORMAT_RGBA8:
		image.convert(Image.FORMAT_RGBA8)
	return image


func _scene_usable(model: DirectorSceneModel) -> bool:
	return model != null and not model.parse_failed and model.schema_version == DirectorSceneModel.SCHEMA_VERSION and not model.scene_id.is_empty()


func _valid_scene_id(scene_id: String) -> bool:
	DirectorSceneModel._ensure_regex()
	return DirectorSceneModel._scene_id_re.search(scene_id) != null


func _scenes_dir() -> String:
	return root + "scenes/"


func _abs(user_path: String) -> String:
	return ProjectSettings.globalize_path(user_path)


func _read_json_dict(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) == TYPE_DICTIONARY:
		return parsed
	return {}
