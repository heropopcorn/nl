class_name WaterRegionController
extends Node2D

## Independent rectangle/polygon water surfaces. One ShaderMaterial per region.

const WATER_COLOR := Color(92.0 / 255.0, 168.0 / 255.0, 210.0 / 255.0, 1.0)

var village: VillageSandbox
var _shader: Shader
var _shared_texture: ImageTexture
var _items: Dictionary = {} # id -> {sprite, body, material, region, flow_lines, fallback}
var _flow_cache: Dictionary = {} # id -> {key, texture}; survives rebuilds
var director_time: float = 0.0


func setup(host: VillageSandbox) -> void:
	village = host
	name = "WaterRegions"
	z_index = 0
	_shader = load("res://shaders/water_flow.gdshader") as Shader
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(WATER_COLOR)
	_shared_texture = ImageTexture.create_from_image(image)


func set_director_time(value: float) -> void:
	director_time = value
	for id in _items:
		var item: Dictionary = _items[id]
		var mat: ShaderMaterial = item.get("material")
		if mat:
			mat.set_shader_parameter("director_time", director_time)


func rebuild(model: DirectorSceneModel) -> void:
	_clear()
	if model == null:
		return
	var global_collision := bool(model.editor.get("water_collision_enabled", true))
	for region in model.water_regions:
		_spawn(model, region, global_collision)


func material_flow_dir(region_id: String) -> Vector2:
	if not _items.has(region_id):
		return Vector2.ZERO
	var mat: ShaderMaterial = _items[region_id].get("material")
	if mat == null:
		return Vector2.ZERO
	var value: Variant = mat.get_shader_parameter("flow_dir")
	if value is Vector2:
		return value
	return Vector2.ZERO


func material_flow_speed(region_id: String) -> float:
	if not _items.has(region_id):
		return -1.0
	var mat: ShaderMaterial = _items[region_id].get("material")
	if mat == null:
		return -1.0
	return float(mat.get_shader_parameter("flow_speed"))


## Local flow direction at a world position inside a spawned region; follows
## the drawn flow lines, or the region's single flow direction without lines.
func flow_direction_at(region_id: String, world_pos: Vector2) -> Vector2:
	if not _items.has(region_id):
		return Vector2.ZERO
	var item: Dictionary = _items[region_id]
	return FlowField.direction_at(world_pos, item["flow_lines"], item["fallback"])


## Nearest-texel lookup in the baked flow map; cheap enough for per-frame
## editor gizmos. Returns Vector2.ZERO outside the region's bounds.
func baked_flow_direction(region_id: String, world_pos: Vector2) -> Vector2:
	if not _items.has(region_id) or not _flow_cache.has(region_id):
		return Vector2.ZERO
	var rect: Rect2 = _items[region_id]["rect"]
	var image: Image = _flow_cache[region_id]["image"]
	var uv := (world_pos - rect.position) / rect.size
	if uv.x < 0.0 or uv.y < 0.0 or uv.x > 1.0 or uv.y > 1.0:
		return Vector2.ZERO
	var x := clampi(int(uv.x * image.get_width()), 0, image.get_width() - 1)
	var y := clampi(int(uv.y * image.get_height()), 0, image.get_height() - 1)
	var texel := image.get_pixel(x, y)
	return Vector2(texel.r * 2.0 - 1.0, texel.g * 2.0 - 1.0).normalized()


func has_flow_map(region_id: String) -> bool:
	if not _items.has(region_id):
		return false
	var mat: ShaderMaterial = _items[region_id].get("material")
	return mat != null and mat.get_shader_parameter("flow_map") is Texture2D


func world_flow_lines_of(region: Dictionary) -> Array[PackedVector2Array]:
	var out: Array[PackedVector2Array] = []
	for line in DirectorSceneModel.flow_lines_of(region):
		var world_line := PackedVector2Array()
		for point in line:
			world_line.append(village.uv_to_world(point))
		out.append(world_line)
	return out


func material_current_strength(region_id: String) -> float:
	if not _items.has(region_id):
		return -1.0
	var mat: ShaderMaterial = _items[region_id].get("material")
	return float(mat.get_shader_parameter("current_strength")) if mat else -1.0


func hit_region(world_pos: Vector2, model: DirectorSceneModel) -> String:
	if model == null:
		return ""
	var i := model.water_regions.size() - 1
	while i >= 0:
		var region: Dictionary = model.water_regions[i]
		var poly := world_polygon_of(region)
		if poly.size() >= 3 and Geometry2D.is_point_in_polygon(world_pos, poly):
			return str(region.get("id", ""))
		i -= 1
	return ""


func world_rect_of(region: Dictionary) -> Rect2:
	var uv := DirectorSceneModel.polygon_bounds(DirectorSceneModel.water_polygon(region))
	var top_left := village.uv_to_world(uv.position)
	var size := Vector2(uv.size.x * village.terrain_size().x, uv.size.y * village.terrain_size().y)
	return Rect2(top_left, size)


func world_polygon_of(region: Dictionary) -> PackedVector2Array:
	var result := PackedVector2Array()
	for point in DirectorSceneModel.water_polygon(region):
		result.append(village.uv_to_world(point))
	return result


func _spawn(model: DirectorSceneModel, region: Dictionary, global_collision: bool) -> void:
	if not bool(region.get("enabled", true)):
		return
	var polygon := world_polygon_of(region)
	var rect := world_rect_of(region)
	if rect.size.x < 1.0 or rect.size.y < 1.0:
		return
	var surface: CanvasItem
	if str(region.get("shape", "rect")) == "polygon":
		var poly := Polygon2D.new()
		poly.name = str(region.get("id", "water"))
		poly.polygon = polygon
		var uv := PackedVector2Array()
		for point in polygon:
			uv.append((point - rect.position) / rect.size * 64.0)
		poly.uv = uv
		poly.texture = _shared_texture
		surface = poly
	else:
		var sprite := Sprite2D.new()
		sprite.name = str(region.get("id", "water"))
		sprite.texture = _shared_texture
		sprite.centered = true
		sprite.position = rect.position + rect.size * 0.5
		sprite.scale = Vector2(rect.size.x / 64.0, rect.size.y / 64.0)
		surface = sprite
	surface.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	surface.z_index = int(region.get("layer", -15))
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	var flow := DirectorSceneModel.normalize_flow(
		DirectorSceneModel._vec2(region.get("flow_dir", [0, 1]), Vector2(0, 1))
	)
	mat.set_shader_parameter("flow_dir", flow)
	var flow_lines := world_flow_lines_of(region)
	mat.set_shader_parameter("flow_map", _flow_map_for(str(region.get("id", "")), rect, flow_lines, flow))
	mat.set_shader_parameter("has_flow_map", true)
	mat.set_shader_parameter("flow_speed", float(region.get("flow_speed", 0.22)))
	mat.set_shader_parameter("region_size", rect.size)
	mat.set_shader_parameter("current_strength", 0.95)
	mat.set_shader_parameter("surface_mist", 0.08)
	mat.set_shader_parameter("refraction_strength", 0.32)
	mat.set_shader_parameter("tint", Color(0.32, 0.68, 0.90, 0.60))
	mat.set_shader_parameter("director_time", director_time)
	surface.material = mat
	add_child(surface)

	var body: StaticBody2D = null
	var collide := global_collision and bool(region.get("collision_enabled", true))
	if collide:
		body = StaticBody2D.new()
		body.name = str(region.get("id", "water")) + "_body"
		body.collision_layer = 1
		body.collision_mask = 0
		if str(region.get("shape", "rect")) == "polygon":
			var cs_poly := CollisionPolygon2D.new()
			cs_poly.polygon = polygon
			body.add_child(cs_poly)
		else:
			body.position = rect.position + rect.size * 0.5
			var cs := CollisionShape2D.new()
			var shape := RectangleShape2D.new()
			shape.size = rect.size
			cs.shape = shape
			body.add_child(cs)
		add_child(body)

	_items[str(region.get("id", ""))] = {
		"sprite": surface,
		"body": body,
		"material": mat,
		"region": region,
		"flow_lines": flow_lines,
		"fallback": flow,
		"rect": rect,
	}


func _flow_map_for(region_id: String, rect: Rect2, lines: Array[PackedVector2Array], fallback: Vector2) -> Texture2D:
	var relative: Array = []
	for line in lines:
		var shifted := PackedVector2Array()
		for point in line:
			shifted.append((point - rect.position).snapped(Vector2(0.01, 0.01)))
		relative.append(shifted)
	var key := var_to_str([rect.size.snapped(Vector2(0.01, 0.01)), relative, fallback])
	var cached: Dictionary = _flow_cache.get(region_id, {})
	if cached.get("key", "") == key:
		return cached["texture"]
	var image := FlowField.bake(rect, lines, fallback)
	var texture := ImageTexture.create_from_image(image)
	_flow_cache[region_id] = {"key": key, "texture": texture, "image": image}
	return texture


func _clear() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_items.clear()
