class_name SceneContentController
extends Node2D

## Renders movable library elements and clipped background regions. Every item
## uses integer z_index; World's Y-sort resolves feet order inside equal layers.

const ASSETS := [
	"house_blue_cottage", "house_market", "house_round_green", "house_watermill",
	"tree_oak", "tree_cherry", "tree_pine", "windmill", "well", "bridge_stone",
	"signboard", "lamppost", "garden_plot", "coop", "cart", "crates_still_life",
	"flowers_white_a", "flowers_white_b", "flowers_blue", "flowers_pink",
]
const LABELS := {
	"house_blue_cottage": "蓝顶小屋", "house_market": "集市房屋", "house_round_green": "圆顶小屋",
	"house_watermill": "水磨坊", "tree_oak": "橡树", "tree_cherry": "樱花树", "tree_pine": "松树",
	"windmill": "风车", "well": "水井", "bridge_stone": "石桥", "signboard": "路牌",
	"lamppost": "路灯", "garden_plot": "菜地", "coop": "鸡舍", "cart": "手推车",
	"crates_still_life": "木箱", "flowers_white_a": "白花 A", "flowers_white_b": "白花 B",
	"flowers_blue": "蓝花", "flowers_pink": "粉花",
}

var village: VillageSandbox
var _element_nodes: Dictionary = {}
var _region_nodes: Dictionary = {}


func setup(host: VillageSandbox) -> void:
	village = host
	name = "DirectorContent"
	y_sort_enabled = true


static func asset_label(asset_id: String) -> String:
	return str(LABELS.get(asset_id, asset_id))


static func asset_exists(asset_id: String) -> bool:
	return asset_id in ASSETS and ResourceLoader.exists("res://art/sliced/%s.png" % asset_id)


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
	var path := "res://art/sliced/%s.png" % asset_id
	if not asset_exists(asset_id):
		return
	var texture := load(path) as Texture2D
	var sprite := Sprite2D.new()
	sprite.name = str(element.get("id", "element"))
	sprite.texture = texture
	sprite.centered = false
	sprite.offset = Vector2(-texture.get_width() * 0.5, -float(texture.get_height()))
	sprite.position = village.uv_to_world(DirectorSceneModel._vec2(element.get("position_uv", [0.5, 0.5]), Vector2(0.5, 0.5)))
	var item_scale := float(element.get("scale", 0.5))
	sprite.scale = Vector2.ONE * item_scale
	sprite.z_index = int(element.get("layer", 0))
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
