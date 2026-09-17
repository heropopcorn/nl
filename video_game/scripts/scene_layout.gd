class_name SceneLayout
extends RefCounted

## user:// overlay contract for the runtime editor MVP.
## Never writes into res://art/approved/.

const VERSION := 1
const USER_JSON := "user://scene_layout.json"
const USER_GROUND := "user://custom_ground.png"
const USER_WATER := "user://water_mask.png"

var has_custom_ground := false
var has_custom_water := false
var hide_baked_props := false
var path_loop := true
var path_ignore_collision := true
var path_uv: Array[Vector2] = []
var water_flow_dir := Vector2(0.18, 0.92)


static func load_user() -> SceneLayout:
	var layout := SceneLayout.new()
	if not FileAccess.file_exists(USER_JSON):
		return layout
	var file := FileAccess.open(USER_JSON, FileAccess.READ)
	if file == null:
		return layout
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return layout
	layout.from_dict(parsed as Dictionary)
	return layout


func save_user() -> void:
	var file := FileAccess.open(USER_JSON, FileAccess.WRITE)
	if file == null:
		push_warning("Could not write %s" % USER_JSON)
		return
	file.store_string(JSON.stringify(to_dict(), "\t"))
	file.store_string("\n")


func from_dict(data: Dictionary) -> void:
	var ground_path := str(data.get("ground", ""))
	var water_path := str(data.get("water_mask", ""))
	has_custom_ground = ground_path.begins_with("user://") and FileAccess.file_exists(USER_GROUND)
	has_custom_water = water_path.begins_with("user://") and FileAccess.file_exists(USER_WATER)
	hide_baked_props = bool(data.get("hide_baked_props", false))
	path_loop = bool(data.get("path_loop", true))
	path_ignore_collision = bool(data.get("path_ignore_collision", true))
	water_flow_dir = _vec2_from_variant(data.get("water_flow_dir", [0.18, 0.92]), water_flow_dir)
	path_uv.clear()
	var raw: Variant = data.get("path_uv", [])
	if raw is Array:
		for item in raw:
			var point := _vec2_from_variant(item, Vector2.ZERO)
			path_uv.append(point.clamp(Vector2.ZERO, Vector2.ONE))


func to_dict() -> Dictionary:
	var uvs: Array = []
	for point in path_uv:
		uvs.append([snappedf(point.x, 0.0001), snappedf(point.y, 0.0001)])
	return {
		"version": VERSION,
		"ground": USER_GROUND if has_custom_ground else "",
		"water_mask": USER_WATER if has_custom_water else "",
		"hide_baked_props": hide_baked_props,
		"water_flow_dir": [water_flow_dir.x, water_flow_dir.y],
		"path_loop": path_loop,
		"path_ignore_collision": path_ignore_collision,
		"path_uv": uvs,
	}


static func _vec2_from_variant(value: Variant, fallback: Vector2) -> Vector2:
	if value is Vector2:
		return value
	if value is Array and (value as Array).size() >= 2:
		return Vector2(float(value[0]), float(value[1]))
	if value is Dictionary:
		var d: Dictionary = value
		return Vector2(float(d.get("x", fallback.x)), float(d.get("y", fallback.y)))
	return fallback
