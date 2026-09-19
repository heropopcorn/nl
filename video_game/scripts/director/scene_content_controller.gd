class_name SceneContentController
extends Node2D

## Renders movable library elements and clipped background regions. Every item
## uses integer z_index; World's Y-sort resolves feet order inside equal layers.

const CATEGORY_LABELS := {"houses": "房屋", "trees": "树木", "props": "道具"}
const ASSETS := [
	{"id": "house_blue_cottage", "label": "蓝顶小屋", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "house_market", "label": "集市房屋", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "house_round_green", "label": "圆顶小屋", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "house_watermill", "label": "水磨坊", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "windmill", "label": "风车", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "coop", "label": "鸡舍", "category": "houses", "default_layer": 0, "default_scale": 0.5},
	{"id": "tree_oak", "label": "橡树", "category": "trees", "default_layer": 0, "default_scale": 0.5},
	{"id": "tree_cherry", "label": "樱花树", "category": "trees", "default_layer": 0, "default_scale": 0.5},
	{"id": "tree_pine", "label": "松树", "category": "trees", "default_layer": 0, "default_scale": 0.5},
	{"id": "well", "label": "水井", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "bridge_stone", "label": "石桥", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "signboard", "label": "路牌", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "lamppost", "label": "路灯", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "garden_plot", "label": "菜地", "category": "props", "default_layer": -1, "default_scale": 0.5},
	{"id": "cart", "label": "手推车", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "crates_still_life", "label": "木箱", "category": "props", "default_layer": 1, "default_scale": 0.5},
	{"id": "flowers_white_a", "label": "白花甲", "category": "props", "default_layer": -1, "default_scale": 0.5},
	{"id": "flowers_white_b", "label": "白花乙", "category": "props", "default_layer": -1, "default_scale": 0.5},
	{"id": "flowers_blue", "label": "蓝花", "category": "props", "default_layer": -1, "default_scale": 0.5},
	{"id": "flowers_pink", "label": "粉花", "category": "props", "default_layer": -1, "default_scale": 0.5},
]

var village: VillageSandbox
var asset_library: DirectorAssetLibrary
var _element_nodes: Dictionary = {}
var _region_nodes: Dictionary = {}


func setup(host: VillageSandbox, library: DirectorAssetLibrary = null) -> void:
	village = host
	asset_library = library
	name = "DirectorContent"
	y_sort_enabled = true


static func asset_label(asset_id: String) -> String:
	return str(asset_info(asset_id).get("label", asset_id))


static func asset_info(asset_id: String) -> Dictionary:
	for asset in ASSETS:
		if str(asset.get("id", "")) == asset_id:
			return asset
	return {}


static func assets_in_category(category: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for asset in ASSETS:
		if str(asset.get("category", "")) == category:
			result.append(asset)
	return result


static func asset_exists(asset_id: String) -> bool:
	return not asset_info(asset_id).is_empty() and ResourceLoader.exists("res://art/sliced/%s.png" % asset_id)


func has_asset(asset_id: String) -> bool:
	return asset_exists(asset_id) or (asset_library != null and asset_library.asset_exists(asset_id))


func asset_label_for(asset_id: String) -> String:
	if asset_exists(asset_id):
		return asset_label(asset_id)
	if asset_library:
		return str(asset_library.info(asset_id).get("name", asset_id))
	return asset_id


func texture_path_for(asset_id: String) -> String:
	if asset_exists(asset_id):
		return "res://art/sliced/%s.png" % asset_id
	return asset_library.texture_path(asset_id) if asset_library else ""


func rebuild(model: DirectorSceneModel) -> void:
	_clear()
	if model == null or village == null:
		return
	for region in model.background_regions:
		_spawn_background_region(region)
	for element in model.elements:
		_spawn_element(element)


func hit_element(world_pos: Vector2) -> String:
	var hits: Array[Dictionary] = []
	for id in _element_nodes:
		var sprite: Sprite2D = _element_nodes[id]
		if sprite.visible and sprite.get_rect().has_point(sprite.to_local(world_pos)):
			hits.append({"id": str(id), "z": sprite.z_index, "y": sprite.global_position.y})
	hits.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if int(a["z"]) != int(b["z"]): return int(a["z"]) > int(b["z"])
		return float(a["y"]) > float(b["y"])
	)
	return "" if hits.is_empty() else str(hits[0]["id"])


func hit_background_region(world_pos: Vector2) -> String:
	var best := ""
	var best_layer := -2147483648
	for id in _region_nodes:
		var node: Polygon2D = _region_nodes[id]
		if node.visible and Geometry2D.is_point_in_polygon(world_pos, node.polygon) and node.z_index >= best_layer:
			best = str(id)
			best_layer = node.z_index
	return best


func element_world_position(id: String) -> Vector2:
	var sprite: Sprite2D = _element_nodes.get(id)
	return sprite.global_position if sprite else Vector2.ZERO


func element_world_corners(id: String) -> PackedVector2Array:
	var result := PackedVector2Array()
	var sprite: Sprite2D = _element_nodes.get(id)
	if sprite == null:
		return result
	var rect := sprite.get_rect()
	for point in [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]:
		result.append(sprite.to_global(point))
	return result


func element_rotation_degrees(id: String) -> float:
	var sprite: Sprite2D = _element_nodes.get(id)
	return sprite.rotation_degrees if sprite else 0.0


func element_z_index(id: String) -> int:
	var sprite: Sprite2D = _element_nodes.get(id)
	return sprite.z_index if sprite else -999999


func region_z_index(id: String) -> int:
	var region: Polygon2D = _region_nodes.get(id)
	return region.z_index if region else -999999


func _spawn_element(element: Dictionary) -> void:
	if not bool(element.get("enabled", true)):
		return
	var asset_id := str(element.get("asset_id", "tree_oak"))
	var path := texture_path_for(asset_id)
	if path.is_empty() or not FileAccess.file_exists(path) and not ResourceLoader.exists(path):
		return
	var texture: Texture2D
	if path.begins_with("user://"):
		var image := Image.new()
		if image.load_png_from_buffer(FileAccess.get_file_as_bytes(path)) != OK:
			return
		texture = ImageTexture.create_from_image(image)
	else:
		texture = load(path) as Texture2D
	var sprite := Sprite2D.new()
	sprite.name = str(element.get("id", "element"))
	sprite.texture = texture
	sprite.centered = false
	sprite.offset = Vector2(-texture.get_width() * 0.5, -float(texture.get_height()))
	sprite.position = village.uv_to_world(DirectorSceneModel._vec2(element.get("position_uv", [0.5, 0.5]), Vector2(0.5, 0.5)))
	var item_scale := float(element.get("scale", 0.5))
	sprite.scale = Vector2.ONE * item_scale
	sprite.rotation_degrees = float(element.get("rotation_degrees", 0.0))
	sprite.z_index = int(element.get("layer", 0))
	sprite.flip_h = bool(element.get("flip_h", false))
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	add_child(sprite)
	_element_nodes[str(element.get("id", ""))] = sprite


func _spawn_background_region(region: Dictionary) -> void:
	if not bool(region.get("enabled", true)) or village.terrain.texture == null:
		return
	var uv_points := DirectorSceneModel.points_from_value(region.get("points_uv", []))
	if uv_points.size() < 3:
		return
	var polygon := PackedVector2Array()
	var texture_uv := PackedVector2Array()
	var size := village.terrain_size()
	for uv in uv_points:
		polygon.append(village.uv_to_world(uv))
		texture_uv.append(Vector2(uv.x * size.x, uv.y * size.y))
	var node := Polygon2D.new()
	node.name = str(region.get("id", "background_region"))
	node.polygon = polygon
	node.uv = texture_uv
	node.texture = village.terrain.texture
	node.z_index = int(region.get("layer", 0))
	node.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	add_child(node)
	_region_nodes[str(region.get("id", ""))] = node


func _clear() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_element_nodes.clear()
	_region_nodes.clear()
