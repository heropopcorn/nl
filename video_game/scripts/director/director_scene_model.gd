class_name DirectorSceneModel
extends RefCounted

## v2 director-desk scene document: parse, validate, unknown-field round-trip.
## User-facing errors are Chinese. Logs may stay English.

const SCHEMA_VERSION := 2
const JSON_MAX_BYTES := 1024 * 1024
const NAME_MIN := 1
const NAME_MAX := 40
const WATER_MAX := 64
const ACTORS_MAX_PARSE := 32
const ELEMENTS_MAX := 256
const REGIONS_MAX := 64
const ROUTE_POINTS_MAX := 256
const WATER_MIN_PX := 8.0
const FLOW_SPEED_MAX := 1.5
const ACTOR_SPEED_MIN := 20.0
const ACTOR_SPEED_MAX := 600.0
const ACTOR_SPEED_DEFAULT := 210.0
const UV_EPS := 0.000001
const OVERLAP_EPS := 0.0000001
const DEFAULT_START_UV := Vector2(0.42, 0.42)
const PRESET_VILLAGE := "village_default"
const PRESET_PIXEL := Vector2i(1152, 864)
const BLANK_PIXEL := Vector2i(1152, 864)
const BLANK_FILL := Color(0.45, 0.50, 0.40, 1.0)
const COORD_ORIGIN := "top_left"
const COORD_UNIT := "normalized_uv"
const COORD_X := "right"
const COORD_Y := "down"

const KNOWN_SCENE_KEYS := [
	"schema_version", "scene_id", "name", "created_at", "updated_at",
	"background", "coordinate_space", "editor", "water_regions", "actors",
	"elements", "background_regions", "weather", "camera", "legacy_water",
]
const KNOWN_BG_KEYS := [
	"source", "preset_id", "file", "original_file_name", "pixel_size",
	"sha256", "fill_color",
]
const KNOWN_COORD_KEYS := ["origin", "unit", "x_axis", "y_axis"]
const KNOWN_EDITOR_KEYS := [
	"show_baked_props", "water_collision_enabled", "snap_enabled", "snap_grid_px",
]
const KNOWN_WATER_KEYS := [
	"id", "name", "enabled", "shape", "rect_uv", "points_uv", "flow_dir", "flow_speed", "collision_enabled", "layer",
]
const KNOWN_ACTOR_KEYS := [
	"id", "character_id", "display_name", "enabled", "start_uv", "layer", "route",
]
const KNOWN_ROUTE_KEYS := ["points_uv", "speed_px_per_sec", "loop", "collision_mode", "visible"]
const KNOWN_ELEMENT_KEYS := ["id", "asset_id", "display_name", "enabled", "position_uv", "layer", "scale", "flip_h"]
const KNOWN_REGION_KEYS := ["id", "name", "enabled", "points_uv", "layer"]
const KNOWN_WEATHER_KEYS := ["enabled", "type", "intensity"]

static var _scene_id_re: RegEx
static var _rfc3339_re: RegEx
static var _simple_file_re: RegEx

var schema_version: int = SCHEMA_VERSION
var scene_id: String = ""
var name: String = ""
var created_at: String = ""
var updated_at: String = ""
var background: Dictionary = {}
var coordinate_space: Dictionary = {}
var editor: Dictionary = {}
var water_regions: Array[Dictionary] = []
var actors: Array[Dictionary] = []
var elements: Array[Dictionary] = []
var background_regions: Array[Dictionary] = []
var weather: Dictionary = {}
var camera: Variant = null
var legacy_water: Variant = null
var extras: Dictionary = {}
var errors: PackedStringArray = PackedStringArray()
var warnings: PackedStringArray = PackedStringArray()
var parse_failed: bool = false
var _sticky_parse_errors: PackedStringArray = PackedStringArray()


static func example_path() -> String:
	return "res://docs/director-desk/scene-schema.example.json"


static func now_rfc3339() -> String:
	return Time.get_datetime_string_from_system(true, false) + "Z"


static func new_hex_id(prefix: String, byte_count: int = 8) -> String:
	var crypto := Crypto.new()
	var bytes := crypto.generate_random_bytes(byte_count)
	if bytes.is_empty():
		var hex := ""
		for _i in range(byte_count * 2):
			hex += "%x" % randi_range(0, 15)
		return prefix + hex
	return prefix + bytes.hex_encode()


static func new_scene_id() -> String:
	return new_hex_id("scn_", 8)


static func default_coordinate_space() -> Dictionary:
	return {
		"origin": COORD_ORIGIN,
		"unit": COORD_UNIT,
		"x_axis": COORD_X,
		"y_axis": COORD_Y,
	}


static func default_editor(show_props: bool) -> Dictionary:
	return {
		"show_baked_props": show_props,
		"water_collision_enabled": true,
		"snap_enabled": false,
		"snap_grid_px": 8,
	}


static func default_weather() -> Dictionary:
	return {
		"enabled": false,
		"type": "rain",
		"intensity": 0.6,
	}


static func make_new(p_scene_id: String, p_name: String, p_background: Dictionary) -> DirectorSceneModel:
	var model := DirectorSceneModel.new()
	var stamp := now_rfc3339()
	model.schema_version = SCHEMA_VERSION
	model.scene_id = p_scene_id
	model.name = p_name.strip_edges()
	model.created_at = stamp
	model.updated_at = stamp
	model.background = p_background.duplicate(true)
	model.coordinate_space = default_coordinate_space()
	var source := str(p_background.get("source", "preset"))
	model.editor = default_editor(source == "preset")
	model.weather = default_weather()
	model.validate()
	return model


static func from_json_text(text: String) -> DirectorSceneModel:
	var model := DirectorSceneModel.new()
	if text.to_utf8_buffer().size() > JSON_MAX_BYTES:
		model.parse_failed = true
		model._err("场景文件过大（超过 1 MiB）")
		return model
	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		model.parse_failed = true
		model._err("无法解析场景文件")
		return model
	model.apply_dict(json.data as Dictionary)
	return model


static func from_dict(data: Dictionary) -> DirectorSceneModel:
	var model := DirectorSceneModel.new()
	model.apply_dict(data)
	return model


func apply_dict(data: Dictionary) -> void:
	errors = PackedStringArray()
	warnings = PackedStringArray()
	_sticky_parse_errors = PackedStringArray()
	parse_failed = false
	extras = _take_extras(data, KNOWN_SCENE_KEYS)
	schema_version = _as_int(data.get("schema_version", 0), 0)
	scene_id = str(data.get("scene_id", "")).strip_edges()
	name = str(data.get("name", "")).strip_edges()
	created_at = str(data.get("created_at", ""))
	updated_at = str(data.get("updated_at", ""))
	background = _parse_background(data.get("background", {}))
	coordinate_space = _parse_coordinate_space(data.get("coordinate_space", {}))
	editor = _parse_editor(data.get("editor", {}))
	water_regions.clear()
	var raw_water: Variant = data.get("water_regions", [])
	if raw_water is Array:
		var waters: Array = raw_water
		if waters.size() > WATER_MAX:
			_parse_err("水域数量超过 64")
		var limit := mini(waters.size(), WATER_MAX)
		for i in range(limit):
			if waters[i] is Dictionary:
				water_regions.append(_parse_water(waters[i]))
			else:
				_parse_err("水域条目格式无效")
	else:
		_parse_err("water_regions 必须是数组")
	actors.clear()
	var raw_actors: Variant = data.get("actors", [])
	if raw_actors is Array:
		var actor_list: Array = raw_actors
		if actor_list.size() > ACTORS_MAX_PARSE:
			_warn("角色数量超过解析上限，已截断")
		var alimit := mini(actor_list.size(), ACTORS_MAX_PARSE)
		for i in range(alimit):
			if actor_list[i] is Dictionary:
				actors.append(_parse_actor(actor_list[i]))
			else:
				_parse_err("角色条目格式无效")
	else:
		_parse_err("actors 必须是数组")
	elements.clear()
	var raw_elements: Variant = data.get("elements", [])
	if raw_elements is Array:
		for i in range(mini((raw_elements as Array).size(), ELEMENTS_MAX)):
			if raw_elements[i] is Dictionary:
				elements.append(_parse_element(raw_elements[i]))
	else:
		_parse_err("elements 必须是数组")
	background_regions.clear()
	var raw_regions: Variant = data.get("background_regions", [])
	if raw_regions is Array:
		for i in range(mini((raw_regions as Array).size(), REGIONS_MAX)):
			if raw_regions[i] is Dictionary:
				background_regions.append(_parse_background_region(raw_regions[i]))
	else:
		_parse_err("background_regions 必须是数组")
	weather = _parse_weather(data.get("weather", {}))
	if data.has("camera"):
		camera = data["camera"]
	else:
		camera = null
	if data.has("legacy_water"):
		legacy_water = data["legacy_water"]
	else:
		legacy_water = null
	validate()


func to_dict() -> Dictionary:
	var out: Dictionary = extras.duplicate(true)
	out["schema_version"] = SCHEMA_VERSION
	out["scene_id"] = scene_id
	out["name"] = name
	out["created_at"] = created_at
	out["updated_at"] = updated_at
	out["background"] = _export_background()
	out["coordinate_space"] = _export_with_extras(coordinate_space, [
		"origin", "unit", "x_axis", "y_axis",
	], {
		"origin": str(coordinate_space.get("origin", COORD_ORIGIN)),
		"unit": str(coordinate_space.get("unit", COORD_UNIT)),
		"x_axis": str(coordinate_space.get("x_axis", COORD_X)),
		"y_axis": str(coordinate_space.get("y_axis", COORD_Y)),
	})
	out["editor"] = _export_with_extras(editor, [
		"show_baked_props", "water_collision_enabled", "snap_enabled", "snap_grid_px",
	], {
		"show_baked_props": bool(editor.get("show_baked_props", true)),
		"water_collision_enabled": bool(editor.get("water_collision_enabled", true)),
		"snap_enabled": bool(editor.get("snap_enabled", false)),
		"snap_grid_px": _as_int(editor.get("snap_grid_px", 8), 8),
	})
	var waters: Array = []
	for region in water_regions:
		waters.append(_export_water(region))
	out["water_regions"] = waters
	var actor_out: Array = []
	for actor in actors:
		actor_out.append(_export_actor(actor))
	out["actors"] = actor_out
	var element_out: Array = []
	for element in elements:
		element_out.append(_export_element(element))
	out["elements"] = element_out
	var region_out: Array = []
	for region in background_regions:
		region_out.append(_export_background_region(region))
	out["background_regions"] = region_out
	out["weather"] = _export_with_extras(weather, KNOWN_WEATHER_KEYS, {
		"enabled": bool(weather.get("enabled", false)),
		"type": str(weather.get("type", "rain")),
		"intensity": snap6(float(weather.get("intensity", 0.6))),
	})
	if camera != null:
		out["camera"] = camera
	if legacy_water != null:
		out["legacy_water"] = legacy_water
	return out


func to_json_text() -> String:
	return JSON.stringify(to_dict(), "\t") + "\n"


func duplicate_model() -> DirectorSceneModel:
	return DirectorSceneModel.from_dict(to_dict())


func is_valid() -> bool:
	return errors.is_empty() and not parse_failed


func pixel_size() -> Vector2i:
	var raw: Variant = background.get("pixel_size", [PRESET_PIXEL.x, PRESET_PIXEL.y])
	var arr := _as_number_array(raw)
	if arr.size() >= 2:
		return Vector2i(maxi(1, int(round(arr[0]))), maxi(1, int(round(arr[1]))))
	return PRESET_PIXEL


func has_water_overlap() -> bool:
	return not overlapping_pairs().is_empty()


func overlapping_pairs() -> Array:
	var pairs: Array = []
	for i in range(water_regions.size()):
		for j in range(i + 1, water_regions.size()):
			if polygons_overlap(water_polygon(water_regions[i]), water_polygon(water_regions[j])):
				pairs.append([str(water_regions[i].get("id", "")), str(water_regions[j].get("id", ""))])
	return pairs


static func rect_from_region(region: Dictionary) -> Rect2:
	var arr := _as_number_array(region.get("rect_uv", []))
	if arr.size() < 4:
		return Rect2()
	return Rect2(arr[0], arr[1], arr[2], arr[3])


static func water_polygon(region: Dictionary) -> PackedVector2Array:
	if str(region.get("shape", "rect")) == "polygon":
		return points_from_value(region.get("points_uv", []))
	var rect := rect_from_region(region)
	return PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)])


static func points_from_value(value: Variant) -> PackedVector2Array:
	var out := PackedVector2Array()
	if value is Array:
		for item in value:
			out.append(_vec2(item, Vector2.ZERO))
	return out


static func polygon_bounds(points: PackedVector2Array) -> Rect2:
	if points.is_empty():
		return Rect2()
	var minp := points[0]
	var maxp := points[0]
	for point in points:
		minp = minp.min(point)
		maxp = maxp.max(point)
	return Rect2(minp, maxp - minp)


static func polygon_area(points: PackedVector2Array) -> float:
	if points.size() < 3:
		return 0.0
	var total := 0.0
	for i in range(points.size()):
		var a := points[i]
		var b := points[(i + 1) % points.size()]
		total += a.x * b.y - b.x * a.y
	return absf(total) * 0.5


static func polygons_overlap(a: PackedVector2Array, b: PackedVector2Array) -> bool:
	if a.size() < 3 or b.size() < 3:
		return false
	if not rects_overlap_area(polygon_bounds(a), polygon_bounds(b)):
		return false
	for poly in Geometry2D.intersect_polygons(a, b):
		if polygon_area(poly) > OVERLAP_EPS:
			return true
	return false


static func rects_overlap_area(a: Rect2, b: Rect2) -> bool:
	var inter := a.intersection(b)
	return inter.size.x > OVERLAP_EPS and inter.size.y > OVERLAP_EPS


static func normalize_flow(dir: Vector2) -> Vector2:
	if dir.length_squared() < 0.0000001:
		return Vector2(0, 1)
	return dir.normalized()


static func snap6(value: float) -> float:
	return snappedf(value, 0.000001)


static func clamp_uv(value: Vector2) -> Vector2:
	return value.clamp(Vector2.ZERO, Vector2.ONE)


static func vec2_to_arr(value: Vector2) -> Array:
	return [snap6(value.x), snap6(value.y)]


static func color_to_arr(color: Color) -> Array:
	return [snap6(color.r), snap6(color.g), snap6(color.b), snap6(color.a)]


func validate() -> void:
	_ensure_regex()
	errors = PackedStringArray()
	warnings = PackedStringArray()
	for item in _sticky_parse_errors:
		_err(item)
	if parse_failed:
		return
	if schema_version != SCHEMA_VERSION:
		_err("schema_version 必须为 2")
	if _scene_id_re.search(scene_id) == null:
		_err("场景 ID 格式无效")
	var name_len := name.length()
	if name_len < NAME_MIN or name_len > NAME_MAX:
		_err("场景名称须为 1–40 个字符")
	if not _is_rfc3339(created_at) or not _is_rfc3339(updated_at):
		_err("时间戳必须是 UTC RFC 3339")
	_validate_coordinate_space()
	_validate_background()
	_validate_waters()
	_validate_actors()
	_validate_elements()
	_validate_background_regions()
	_validate_weather()


func touch_updated() -> void:
	updated_at = now_rfc3339()


func _validate_coordinate_space() -> void:
	if str(coordinate_space.get("origin", "")) != COORD_ORIGIN \
			or str(coordinate_space.get("unit", "")) != COORD_UNIT \
			or str(coordinate_space.get("x_axis", "")) != COORD_X \
			or str(coordinate_space.get("y_axis", "")) != COORD_Y:
		_err("不支持的坐标空间，已拒绝加载")


func _validate_background() -> void:
	var source := str(background.get("source", ""))
	if source != "preset" and source != "blank" and source != "uploaded":
		_err("背景来源无效")
	var size := pixel_size()
	if size.x <= 0 or size.y <= 0:
		_err("背景尺寸必须为正整数")
	if source == "preset":
		var preset_id := str(background.get("preset_id", ""))
		if preset_id.is_empty():
			_err("预设背景缺少 preset_id")
		elif preset_id != PRESET_VILLAGE:
			_warn("未知预设 %s，预览将使用默认村庄" % preset_id)
	if source == "uploaded":
		var file_name := str(background.get("file", ""))
		if file_name.is_empty():
			_err("上传背景缺少 file")
		elif not _is_safe_relative_file(file_name):
			_err("背景路径不安全")
	if source == "blank" and not background.has("fill_color"):
		background["fill_color"] = color_to_arr(BLANK_FILL)


func _validate_waters() -> void:
	var seen := {}
	var px := pixel_size()
	for region in water_regions:
		var rid := str(region.get("id", ""))
		if rid.is_empty():
			_err("水域缺少 id")
		elif seen.has(rid):
			_err("水域 ID 重复")
		else:
			seen[rid] = true
		if not rid.is_empty() and not rid.begins_with("water_"):
			_warn("水域 ID 应使用 water_ 前缀")
		var poly := water_polygon(region)
		var bounds := polygon_bounds(poly)
		if poly.size() < 3 or polygon_area(poly) <= UV_EPS:
			_err("水域区域无效")
		for point in poly:
			if point.x < -UV_EPS or point.y < -UV_EPS or point.x > 1.0 + UV_EPS or point.y > 1.0 + UV_EPS:
				_err("UV 坐标必须在 0 到 1 之间")
				break
		if bounds.size.x * float(px.x) + 0.001 < WATER_MIN_PX \
				or bounds.size.y * float(px.y) + 0.001 < WATER_MIN_PX:
			_err("水域区域过小（至少 8×8 像素）")
		var speed := float(region.get("flow_speed", 0.22))
		if speed < 0.0 or speed > FLOW_SPEED_MAX:
			_err("流速须在 0 到 1.5 之间")
	if has_water_overlap():
		_err("水域不能重叠")


func _validate_actors() -> void:
	var seen := {}
	for actor in actors:
		var aid := str(actor.get("id", ""))
		if aid.is_empty():
			_err("角色缺少 id")
		elif seen.has(aid):
			_err("角色 ID 重复")
		else:
			seen[aid] = true
		if not aid.is_empty() and not aid.begins_with("actor_"):
			_warn("角色 ID 应使用 actor_ 前缀")
		var start := _vec2(actor.get("start_uv", DEFAULT_START_UV), DEFAULT_START_UV)
		if start.x < -UV_EPS or start.y < -UV_EPS or start.x > 1.0 + UV_EPS or start.y > 1.0 + UV_EPS:
			_err("UV 坐标必须在 0 到 1 之间")
		var route: Dictionary = actor.get("route", {})
		var speed := float(route.get("speed_px_per_sec", ACTOR_SPEED_DEFAULT))
		if speed < ACTOR_SPEED_MIN or speed > ACTOR_SPEED_MAX:
			_err("移动速度须在 20 到 600 之间")
		var mode := str(route.get("collision_mode", "ignore"))
		if mode != "ignore" and mode != "world":
			_warn("未知碰撞模式，预览将按忽略碰撞处理")
		var points: Variant = route.get("points_uv", [])
		if points is Array:
			var pts: Array = points
			if pts.size() > ROUTE_POINTS_MAX:
				_err("路线点数量超过上限")
			for item in pts:
				var p := _vec2(item, Vector2(-1, -1))
				if p.x < -UV_EPS or p.y < -UV_EPS or p.x > 1.0 + UV_EPS or p.y > 1.0 + UV_EPS:
					_err("UV 坐标必须在 0 到 1 之间")
					break


func _validate_elements() -> void:
	var seen := {}
	for element in elements:
		var eid := str(element.get("id", ""))
		if eid.is_empty() or seen.has(eid):
			_err("元素 ID 缺失或重复")
		seen[eid] = true
		if str(element.get("asset_id", "")).is_empty():
			_err("元素缺少素材")
		_validate_uv_point(_vec2(element.get("position_uv", [0.5, 0.5]), Vector2(-1, -1)))
		if float(element.get("scale", 0.5)) < 0.05 or float(element.get("scale", 0.5)) > 4.0:
			_err("元素缩放须在 0.05 到 4 之间")


func _validate_background_regions() -> void:
	var seen := {}
	for region in background_regions:
		var rid := str(region.get("id", ""))
		if rid.is_empty() or seen.has(rid):
			_err("底图区域 ID 缺失或重复")
		seen[rid] = true
		var points := points_from_value(region.get("points_uv", []))
		if points.size() < 3 or polygon_area(points) <= UV_EPS:
			_err("底图区域至少需要 3 个点")
		for point in points:
			_validate_uv_point(point)


func _validate_uv_point(point: Vector2) -> void:
	if point.x < -UV_EPS or point.y < -UV_EPS or point.x > 1.0 + UV_EPS or point.y > 1.0 + UV_EPS:
		_err("UV 坐标必须在 0 到 1 之间")


func _validate_weather() -> void:
	var intensity := float(weather.get("intensity", 0.6))
	if intensity < 0.0 or intensity > 1.0:
		_err("天气强度须在 0 到 1 之间")
	var wtype := str(weather.get("type", "rain"))
	if wtype != "rain":
		_warn("未知天气类型，已忽略执行")


func _parse_background(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		_parse_err("background 必须是对象")
		return {
			"source": "preset",
			"preset_id": PRESET_VILLAGE,
			"pixel_size": [PRESET_PIXEL.x, PRESET_PIXEL.y],
		}
	var data: Dictionary = value
	var out := _take_extras(data, KNOWN_BG_KEYS)
	out["source"] = str(data.get("source", "preset"))
	if data.has("preset_id"):
		var preset_raw: Variant = data["preset_id"]
		out["preset_id"] = null if preset_raw == null else str(preset_raw)
	if data.has("file"):
		var file_raw: Variant = data["file"]
		out["file"] = null if file_raw == null else str(file_raw)
	if data.has("original_file_name"):
		out["original_file_name"] = str(data.get("original_file_name", ""))
	if data.has("sha256"):
		out["sha256"] = str(data.get("sha256", ""))
	if data.has("fill_color"):
		out["fill_color"] = data["fill_color"]
	var size_arr := _as_number_array(data.get("pixel_size", []))
	if size_arr.size() >= 2:
		out["pixel_size"] = [int(round(size_arr[0])), int(round(size_arr[1]))]
	return out


func _parse_coordinate_space(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		_parse_err("coordinate_space 必须是对象")
		return default_coordinate_space()
	var data: Dictionary = value
	var out := _take_extras(data, KNOWN_COORD_KEYS)
	out["origin"] = str(data.get("origin", ""))
	out["unit"] = str(data.get("unit", ""))
	out["x_axis"] = str(data.get("x_axis", ""))
	out["y_axis"] = str(data.get("y_axis", ""))
	return out


func _parse_editor(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		_parse_err("editor 必须是对象")
		return default_editor(true)
	var data: Dictionary = value
	var out := _take_extras(data, KNOWN_EDITOR_KEYS)
	out["show_baked_props"] = bool(data.get("show_baked_props", true))
	out["water_collision_enabled"] = bool(data.get("water_collision_enabled", true))
	out["snap_enabled"] = bool(data.get("snap_enabled", false))
	out["snap_grid_px"] = _as_int(data.get("snap_grid_px", 8), 8)
	return out


func _parse_water(data: Dictionary) -> Dictionary:
	var out := _take_extras(data, KNOWN_WATER_KEYS)
	out["id"] = str(data.get("id", "")).strip_edges()
	out["name"] = str(data.get("name", ""))
	out["enabled"] = bool(data.get("enabled", true))
	out["shape"] = str(data.get("shape", "polygon" if data.has("points_uv") else "rect"))
	var rect_arr := _as_number_array(data.get("rect_uv", []))
	var rect := Rect2()
	if rect_arr.size() >= 4:
		rect = Rect2(rect_arr[0], rect_arr[1], rect_arr[2], rect_arr[3])
	rect.position = clamp_uv(rect.position)
	rect.size.x = clampf(rect.size.x, 0.0, 1.0 - rect.position.x)
	rect.size.y = clampf(rect.size.y, 0.0, 1.0 - rect.position.y)
	out["rect_uv"] = [snap6(rect.position.x), snap6(rect.position.y), snap6(rect.size.x), snap6(rect.size.y)]
	var poly_out: Array = []
	for point in points_from_value(data.get("points_uv", [])):
		poly_out.append(vec2_to_arr(clamp_uv(point)))
	if not poly_out.is_empty():
		out["points_uv"] = poly_out
	var flow := normalize_flow(_vec2(data.get("flow_dir", [0, 1]), Vector2(0, 1)))
	out["flow_dir"] = vec2_to_arr(flow)
	out["flow_speed"] = clampf(float(data.get("flow_speed", 0.22)), 0.0, FLOW_SPEED_MAX)
	out["collision_enabled"] = bool(data.get("collision_enabled", true))
	out["layer"] = _as_int(data.get("layer", -15), -15)
	return out


func _parse_actor(data: Dictionary) -> Dictionary:
	var out := _take_extras(data, KNOWN_ACTOR_KEYS)
	out["id"] = str(data.get("id", "")).strip_edges()
	out["character_id"] = str(data.get("character_id", "farmer_placeholder"))
	out["display_name"] = str(data.get("display_name", ""))
	out["enabled"] = bool(data.get("enabled", true))
	out["start_uv"] = vec2_to_arr(clamp_uv(_vec2(data.get("start_uv", DEFAULT_START_UV), DEFAULT_START_UV)))
	out["layer"] = _as_int(data.get("layer", 0), 0)
	var route_in: Dictionary = {}
	if data.get("route", {}) is Dictionary:
		route_in = data["route"]
	var route := _take_extras(route_in, KNOWN_ROUTE_KEYS)
	var pts_out: Array = []
	var raw_pts: Variant = route_in.get("points_uv", [])
	if raw_pts is Array:
		var pts: Array = raw_pts
		var limit := mini(pts.size(), ROUTE_POINTS_MAX)
		for i in range(limit):
			pts_out.append(vec2_to_arr(clamp_uv(_vec2(pts[i], Vector2.ZERO))))
	route["points_uv"] = pts_out
	route["speed_px_per_sec"] = clampf(
		float(route_in.get("speed_px_per_sec", ACTOR_SPEED_DEFAULT)),
		ACTOR_SPEED_MIN,
		ACTOR_SPEED_MAX
	)
	route["loop"] = bool(route_in.get("loop", false))
	route["collision_mode"] = str(route_in.get("collision_mode", "ignore"))
	route["visible"] = bool(route_in.get("visible", true))
	out["route"] = route
	return out


func _parse_element(data: Dictionary) -> Dictionary:
	var out := _take_extras(data, KNOWN_ELEMENT_KEYS)
	out["id"] = str(data.get("id", ""))
	out["asset_id"] = str(data.get("asset_id", "tree_oak"))
	out["display_name"] = str(data.get("display_name", "元素"))
	out["enabled"] = bool(data.get("enabled", true))
	out["position_uv"] = vec2_to_arr(clamp_uv(_vec2(data.get("position_uv", [0.5, 0.5]), Vector2(0.5, 0.5))))
	out["layer"] = _as_int(data.get("layer", 0), 0)
	out["scale"] = clampf(float(data.get("scale", 0.5)), 0.05, 4.0)
	out["flip_h"] = bool(data.get("flip_h", false))
	return out


func _parse_background_region(data: Dictionary) -> Dictionary:
	var out := _take_extras(data, KNOWN_REGION_KEYS)
	out["id"] = str(data.get("id", ""))
	out["name"] = str(data.get("name", "底图区域"))
	out["enabled"] = bool(data.get("enabled", true))
	out["layer"] = _as_int(data.get("layer", 0), 0)
	var points: Array = []
	for point in points_from_value(data.get("points_uv", [])):
		points.append(vec2_to_arr(clamp_uv(point)))
	out["points_uv"] = points
	return out


func _parse_weather(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_DICTIONARY:
		_parse_err("weather 必须是对象")
		return default_weather()
	var data: Dictionary = value
	var out := _take_extras(data, KNOWN_WEATHER_KEYS)
	out["enabled"] = bool(data.get("enabled", false))
	out["type"] = str(data.get("type", "rain"))
	out["intensity"] = clampf(float(data.get("intensity", 0.6)), 0.0, 1.0)
	return out


func _export_background() -> Dictionary:
	var known := {
		"source": str(background.get("source", "preset")),
		"pixel_size": [pixel_size().x, pixel_size().y],
	}
	if background.has("preset_id"):
		known["preset_id"] = background["preset_id"]
	elif known["source"] == "preset":
		known["preset_id"] = PRESET_VILLAGE
	if background.has("file"):
		known["file"] = background["file"]
	if background.has("original_file_name"):
		known["original_file_name"] = background["original_file_name"]
	if background.has("sha256"):
		known["sha256"] = background["sha256"]
	if background.has("fill_color"):
		known["fill_color"] = background["fill_color"]
	return _export_with_extras(background, KNOWN_BG_KEYS, known)


func _export_water(region: Dictionary) -> Dictionary:
	var known := {
		"id": str(region.get("id", "")),
		"name": str(region.get("name", "")),
		"enabled": bool(region.get("enabled", true)),
		"shape": str(region.get("shape", "rect")),
		"rect_uv": region.get("rect_uv", [0, 0, 0.1, 0.1]),
		"flow_dir": region.get("flow_dir", [0, 1]),
		"flow_speed": snap6(float(region.get("flow_speed", 0.22))),
		"collision_enabled": bool(region.get("collision_enabled", true)),
		"layer": _as_int(region.get("layer", -15), -15),
	}
	if region.has("points_uv"):
		known["points_uv"] = region["points_uv"]
	return _export_with_extras(region, KNOWN_WATER_KEYS, known)


func _export_actor(actor: Dictionary) -> Dictionary:
	var route_in: Dictionary = actor.get("route", {})
	var route_known := {
		"points_uv": route_in.get("points_uv", []),
		"speed_px_per_sec": snap6(float(route_in.get("speed_px_per_sec", ACTOR_SPEED_DEFAULT))),
		"loop": bool(route_in.get("loop", false)),
		"collision_mode": str(route_in.get("collision_mode", "ignore")),
		"visible": bool(route_in.get("visible", true)),
	}
	var route_out := _export_with_extras(route_in, KNOWN_ROUTE_KEYS, route_known)
	return _export_with_extras(actor, KNOWN_ACTOR_KEYS, {
		"id": str(actor.get("id", "")),
		"character_id": str(actor.get("character_id", "farmer_placeholder")),
		"display_name": str(actor.get("display_name", "")),
		"enabled": bool(actor.get("enabled", true)),
		"start_uv": actor.get("start_uv", vec2_to_arr(DEFAULT_START_UV)),
		"layer": _as_int(actor.get("layer", 0), 0),
		"route": route_out,
	})


func _export_element(element: Dictionary) -> Dictionary:
	return _export_with_extras(element, KNOWN_ELEMENT_KEYS, {
		"id": str(element.get("id", "")), "asset_id": str(element.get("asset_id", "tree_oak")),
		"display_name": str(element.get("display_name", "元素")), "enabled": bool(element.get("enabled", true)),
		"position_uv": element.get("position_uv", [0.5, 0.5]), "layer": _as_int(element.get("layer", 0), 0),
		"scale": snap6(float(element.get("scale", 0.5))),
		"flip_h": bool(element.get("flip_h", false)),
	})


func _export_background_region(region: Dictionary) -> Dictionary:
	return _export_with_extras(region, KNOWN_REGION_KEYS, {
		"id": str(region.get("id", "")), "name": str(region.get("name", "底图区域")),
		"enabled": bool(region.get("enabled", true)), "points_uv": region.get("points_uv", []),
		"layer": _as_int(region.get("layer", 0), 0),
	})


func _parse_err(message: String) -> void:
	if message not in _sticky_parse_errors:
		_sticky_parse_errors.append(message)
	_err(message)


func _err(message: String) -> void:
	if message not in errors:
		errors.append(message)


func _warn(message: String) -> void:
	if message not in warnings:
		warnings.append(message)


static func _take_extras(data: Dictionary, known: Array) -> Dictionary:
	var extra := {}
	for key in data.keys():
		if key not in known:
			extra[key] = data[key]
	return extra


static func _export_with_extras(original: Dictionary, known_keys: Array, known_values: Dictionary) -> Dictionary:
	var out := {}
	for key in original.keys():
		if key not in known_keys:
			out[key] = original[key]
	for key in known_values.keys():
		out[key] = known_values[key]
	return out


static func _as_int(value: Variant, fallback: int) -> int:
	if value == null:
		return fallback
	return int(round(float(value)))


static func _as_number_array(value: Variant) -> Array:
	var out: Array = []
	if value is Array:
		for item in value:
			out.append(float(item))
	return out


static func _vec2(value: Variant, fallback: Vector2) -> Vector2:
	if value is Vector2:
		return value
	if value is Array and (value as Array).size() >= 2:
		return Vector2(float(value[0]), float(value[1]))
	if value is Dictionary:
		var d: Dictionary = value
		return Vector2(float(d.get("x", fallback.x)), float(d.get("y", fallback.y)))
	return fallback


static func _is_rfc3339(text: String) -> bool:
	_ensure_regex()
	return _rfc3339_re.search(text) != null


static func _is_safe_relative_file(path: String) -> bool:
	_ensure_regex()
	if path.is_empty() or path.contains("..") or path.contains("://") or path.begins_with("/") \
			or path.begins_with("res://") or path.begins_with("user://") or path.contains("\\"):
		return false
	return _simple_file_re.search(path) != null


static func _ensure_regex() -> void:
	if _scene_id_re == null:
		_scene_id_re = RegEx.new()
		_scene_id_re.compile("^scn_[0-9a-f]{8,32}$")
	if _rfc3339_re == null:
		_rfc3339_re = RegEx.new()
		_rfc3339_re.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$")
	if _simple_file_re == null:
		_simple_file_re = RegEx.new()
		_simple_file_re.compile("^[A-Za-z0-9._-]+$")
