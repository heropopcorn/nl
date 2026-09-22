class_name RainRegionController
extends Node2D

## Renders rain only inside user-drawn world-space polygons. Each region has
## an isolated material so splash and layer settings never leak to neighbours.

const SHADER_PATH := "res://shaders/rain_region.gdshader"

var village: VillageSandbox
var _shader: Shader
var _texture: ImageTexture
var _items: Dictionary = {}
var director_time := -1.0


func setup(host: VillageSandbox) -> void:
	village = host
	name = "RainRegions"
	_shader = load(SHADER_PATH) as Shader
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	_texture = ImageTexture.create_from_image(image)


func rebuild(model: DirectorSceneModel) -> void:
	_clear()
	if model == null or not bool(model.weather.get("enabled", false)) or str(model.weather.get("type", "rain")) != "rain":
		return
	var intensity := clampf(float(model.weather.get("intensity", 0.6)), 0.0, 1.0)
	if intensity <= 0.0:
		return
	for region in model.rain_regions:
		_spawn(region, intensity)


func set_director_time(value: float) -> void:
	director_time = value
	for id in _items:
		var material: ShaderMaterial = _items[id].get("material")
		if material:
			material.set_shader_parameter("director_time", director_time)


func hit_region(world_pos: Vector2, model: DirectorSceneModel) -> String:
	if model == null:
		return ""
	for i in range(model.rain_regions.size() - 1, -1, -1):
		var region: Dictionary = model.rain_regions[i]
		var polygon := world_polygon_of(region)
		if polygon.size() >= 3 and Geometry2D.is_point_in_polygon(world_pos, polygon):
			return str(region.get("id", ""))
	return ""


func world_polygon_of(region: Dictionary) -> PackedVector2Array:
	var result := PackedVector2Array()
	for point in DirectorSceneModel.points_from_value(region.get("points_uv", [])):
		result.append(village.uv_to_world(point))
	return result


func material_splashes_enabled(region_id: String) -> bool:
	if not _items.has(region_id):
		return false
	var material: ShaderMaterial = _items[region_id].get("material")
	return bool(material.get_shader_parameter("splashes_enabled")) if material else false


func material_intensity(region_id: String) -> float:
	if not _items.has(region_id):
		return 0.0
	var material: ShaderMaterial = _items[region_id].get("material")
	return float(material.get_shader_parameter("intensity")) if material else 0.0


func _spawn(region: Dictionary, intensity: float) -> void:
	if not bool(region.get("enabled", true)):
		return
	var polygon := world_polygon_of(region)
	if polygon.size() < 3:
		return
	var bounds := DirectorSceneModel.polygon_bounds(polygon)
	if bounds.size.x < 1.0 or bounds.size.y < 1.0:
		return
	var surface := Polygon2D.new()
	surface.name = str(region.get("id", "rain"))
	surface.polygon = polygon
	var texture_uv := PackedVector2Array()
	for point in polygon:
		texture_uv.append((point - bounds.position) / bounds.size * 64.0)
	surface.uv = texture_uv
	surface.texture = _texture
	surface.z_index = int(region.get("layer", 30))
	surface.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var material := ShaderMaterial.new()
	material.shader = _shader
	material.set_shader_parameter("intensity", intensity)
	material.set_shader_parameter("director_time", director_time)
	material.set_shader_parameter("region_size", bounds.size)
	material.set_shader_parameter("splashes_enabled", bool(region.get("splashes_enabled", true)))
	surface.material = material
	add_child(surface)
	_items[str(region.get("id", ""))] = {"surface": surface, "material": material, "region": region}


func _clear() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_items.clear()
