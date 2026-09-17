class_name WaterRegionController
extends Node2D

## Independent water sprites + rectangle collision. One ShaderMaterial per region.

const WATER_COLOR := Color(92.0 / 255.0, 168.0 / 255.0, 210.0 / 255.0, 0.72)

var village: VillageSandbox
var _shader: Shader
var _shared_texture: ImageTexture
var _items: Dictionary = {} # id -> {sprite, body, material, region}
var director_time: float = 0.0


func setup(host: VillageSandbox) -> void:
	village = host
	name = "WaterRegions"
	z_index = -15
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


func hit_region(world_pos: Vector2, model: DirectorSceneModel) -> String:
	if model == null:
		return ""
	var i := model.water_regions.size() - 1
	while i >= 0:
		var region: Dictionary = model.water_regions[i]
		var rect := world_rect_of(region)
		if rect.has_point(world_pos):
			return str(region.get("id", ""))
		i -= 1
	return ""


func world_rect_of(region: Dictionary) -> Rect2:
	var uv := DirectorSceneModel.rect_from_region(region)
	var top_left := village.uv_to_world(uv.position)
	var size := Vector2(uv.size.x * village.terrain_size().x, uv.size.y * village.terrain_size().y)
	return Rect2(top_left, size)


func _spawn(model: DirectorSceneModel, region: Dictionary, global_collision: bool) -> void:
	if not bool(region.get("enabled", true)):
		return
	var rect := world_rect_of(region)
	if rect.size.x < 1.0 or rect.size.y < 1.0:
		return
	var sprite := Sprite2D.new()
	sprite.name = str(region.get("id", "water"))
	sprite.texture = _shared_texture
	sprite.centered = true
	sprite.position = rect.position + rect.size * 0.5
	sprite.scale = Vector2(rect.size.x / 64.0, rect.size.y / 64.0)
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	var flow := DirectorSceneModel.normalize_flow(
		DirectorSceneModel._vec2(region.get("flow_dir", [0, 1]), Vector2(0, 1))
	)
	mat.set_shader_parameter("flow_dir", flow)
	mat.set_shader_parameter("flow_speed", float(region.get("flow_speed", 0.22)))
	mat.set_shader_parameter("tint", Color(0.42, 0.76, 0.92, 0.50))
	mat.set_shader_parameter("director_time", director_time)
	sprite.material = mat
	add_child(sprite)

	var body: StaticBody2D = null
	var collide := global_collision and bool(region.get("collision_enabled", true))
	if collide:
		body = StaticBody2D.new()
		body.name = str(region.get("id", "water")) + "_body"
		body.collision_layer = 1
		body.collision_mask = 0
		body.position = sprite.position
		var cs := CollisionShape2D.new()
		var shape := RectangleShape2D.new()
		shape.size = rect.size
		cs.shape = shape
		body.add_child(cs)
		add_child(body)

	_items[str(region.get("id", ""))] = {
		"sprite": sprite,
		"body": body,
		"material": mat,
		"region": region,
	}


func _clear() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_items.clear()
