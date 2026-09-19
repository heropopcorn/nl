class_name DirectorAssetLibrary
extends RefCounted

## Persistent user image assets shared by Director Desk scenes.

const DEFAULT_ROOT := "user://director_desk/assets/"
const INDEX_FILE := "index.json"
const CATEGORIES := ["backgrounds", "trees", "characters", "houses"]

var root := DEFAULT_ROOT
var last_error := ""


func _init(p_root: String = DEFAULT_ROOT) -> void:
	root = p_root if p_root.ends_with("/") else p_root + "/"


func ensure_root() -> bool:
	var err := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(root))
	if err != OK and err != ERR_ALREADY_EXISTS:
		last_error = "无法创建自定义资源目录"
		return false
	if not FileAccess.file_exists(root + INDEX_FILE):
		return _write_index([])
	return true


func list_assets(category: String = "") -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for item in _read_index():
		if not (item is Dictionary):
			continue
		if category.is_empty() or str(item.get("category", "")) == category:
			out.append(item)
	return out


func info(asset_id: String) -> Dictionary:
	for item in _read_index():
		if item is Dictionary and str(item.get("id", "")) == asset_id:
			return item
	return {}


func asset_exists(asset_id: String) -> bool:
	var item := info(asset_id)
	return not item.is_empty() and FileAccess.file_exists(root + str(item.get("file", "")))


func texture_path(asset_id: String) -> String:
	var item := info(asset_id)
	if item.is_empty():
		return ""
	var file_name := str(item.get("file", ""))
	if file_name.get_file() != file_name or not file_name.ends_with(".png"):
		return ""
	return root + file_name


func import_image(bytes: PackedByteArray, original_name: String, category: String) -> Dictionary:
	last_error = ""
	if category not in CATEGORIES:
		last_error = "未知资源分类"
		return {}
	if not ensure_root():
		return {}
	var decoded := DirectorImages.decode_upload(bytes)
	if not bool(decoded.get("ok", false)):
		last_error = str(decoded.get("error", "无法解码图片"))
		return {}
	var asset_id := DirectorSceneModel.new_hex_id("custom_", 6)
	var file_name := asset_id + ".png"
	var image: Image = decoded["image"]
	if image.save_png(root + file_name) != OK:
		last_error = "无法保存自定义资源"
		return {}
	var display_name := original_name.get_basename().strip_edges()
	if display_name.is_empty():
		display_name = "自定义资源"
	var item := {
		"id": asset_id,
		"name": display_name.substr(0, 40),
		"category": category,
		"file": file_name,
		"pixel_size": [image.get_width(), image.get_height()],
	}
	var items := list_assets()
	items.append(item)
	if not _write_index(items):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(root + file_name))
		return {}
	return item


func _read_index() -> Array:
	if not FileAccess.file_exists(root + INDEX_FILE):
		return []
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(root + INDEX_FILE))
	if not (parsed is Dictionary) or not (parsed.get("assets", []) is Array):
		last_error = "自定义资源索引损坏"
		return []
	return parsed.get("assets", [])


func _write_index(items: Array) -> bool:
	var file := FileAccess.open(root + INDEX_FILE, FileAccess.WRITE)
	if file == null:
		last_error = "无法写入自定义资源索引"
		return false
	file.store_string(JSON.stringify({"schema_version": 1, "assets": items}, "\t"))
	file.close()
	return true
