extends Node2D

## First village sandbox: orthographic ground + a few isometric atlas props.

const GROUND_PATH := "res://art/approved/chatgpt-terrain-ground-approved.png"
const WATER_MASK_PATH := "res://art/generated/water_mask.png"
const ATLAS_PATH := "res://art/approved/chatgpt-terrain-assets-approved.png"
const SLICED_DIR := "res://art/sliced/"

# UV is top-left origin on the terrain texture. Feet sit on the node origin.
# Garden plots and the stone bridge are skipped — the ground map already paints them.
const PROP_LAYOUT: Array[Dictionary] = [
	{"name": "house_blue_cottage", "uv": Vector2(0.20, 0.33), "scale": 0.48, "radius": 34.0},
	{"name": "house_market", "uv": Vector2(0.36, 0.18), "scale": 0.46, "radius": 32.0},
	{"name": "house_round_green", "uv": Vector2(0.54, 0.20), "scale": 0.42, "radius": 28.0},
	{"name": "house_watermill", "uv": Vector2(0.07, 0.80), "scale": 0.42, "radius": 32.0},
	{"name": "windmill", "uv": Vector2(0.90, 0.34), "scale": 0.40, "radius": 28.0},
	{"name": "tree_oak", "uv": Vector2(0.27, 0.52), "scale": 0.50, "radius": 22.0},
	{"name": "tree_pine", "uv": Vector2(0.86, 0.52), "scale": 0.46, "radius": 18.0},
	{"name": "well", "uv": Vector2(0.62, 0.70), "scale": 0.40, "radius": 16.0},
	{"name": "signboard", "uv": Vector2(0.40, 0.40), "scale": 0.38, "radius": 12.0},
	{"name": "lamppost", "uv": Vector2(0.50, 0.46), "scale": 0.36, "radius": 8.0},
	{"name": "coop", "uv": Vector2(0.18, 0.90), "scale": 0.38, "radius": 26.0},
	{"name": "cart", "uv": Vector2(0.42, 0.66), "scale": 0.40, "radius": 18.0},
	{"name": "crates_still_life", "uv": Vector2(0.52, 0.62), "scale": 0.36, "radius": 16.0},
	{"name": "flowers_white_a", "uv": Vector2(0.18, 0.60), "scale": 0.34, "radius": 0.0},
	{"name": "flowers_white_b", "uv": Vector2(0.72, 0.58), "scale": 0.32, "radius": 0.0},
	{"name": "flowers_blue", "uv": Vector2(0.90, 0.72), "scale": 0.34, "radius": 0.0},
	{"name": "flowers_pink", "uv": Vector2(0.56, 0.84), "scale": 0.34, "radius": 0.0},
]

@onready var world: Node2D = $World
@onready var terrain: Sprite2D = $World/Terrain
@onready var water: Sprite2D = $World/WaterOverlay
@onready var player: CharacterBody2D = $World/Player
@onready var camera: Camera2D = $World/Player/Camera2D
@onready var hint: Label = $HUD/ControlsHint


func _ready() -> void:
	_bind_terrain()
	_bind_water()
	_place_props()
	_place_reference_atlas()
	_build_water_collision()
	_build_map_bounds()
	_place_player()
	_limit_camera()
	print("Village ready — props spawned, water mask on, player at plaza.")
	if "--screenshot" in OS.get_cmdline_user_args():
		await get_tree().create_timer(0.6).timeout
		_save_screenshot()
		get_tree().quit()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_F1:
			hint.visible = not hint.visible
		elif event.physical_keycode == KEY_F3:
			get_tree().debug_collisions_hint = not get_tree().debug_collisions_hint


func _bind_terrain() -> void:
	if terrain.texture == null:
		terrain.texture = load(GROUND_PATH)
	terrain.centered = true
	terrain.z_index = -20
	terrain.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func _bind_water() -> void:
	var mask := load(WATER_MASK_PATH) as Texture2D
	if mask == null:
		push_warning("Water mask missing; run python3 tools/prepare_art.py")
		return
	water.texture = mask
	water.centered = true
	water.z_index = -15
	if water.material == null:
		water.material = load("res://resources/water_flow_material.tres")
	water.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func _place_props() -> void:
	var ground_size := terrain.texture.get_size()
	var origin := -ground_size * 0.5
	for item in PROP_LAYOUT:
		var prop_name := str(item["name"])
		var uv: Vector2 = item["uv"]
		var prop_scale := float(item["scale"])
		var tex_path := SLICED_DIR + prop_name + ".png"
		if not ResourceLoader.exists(tex_path):
			push_warning("Missing slice %s" % tex_path)
			continue
		var tex := load(tex_path) as Texture2D
		var node := StaticBody2D.new()
		node.name = prop_name
		node.position = origin + Vector2(ground_size.x * uv.x, ground_size.y * uv.y)
		var sprite := Sprite2D.new()
		sprite.texture = tex
		sprite.centered = false
		sprite.offset = Vector2(-tex.get_width() * 0.5, -float(tex.get_height()))
		sprite.scale = Vector2.ONE * prop_scale
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		node.add_child(sprite)
		var radius := float(item["radius"])
		if radius > 1.0:
			var collision := CollisionShape2D.new()
			var circle := CircleShape2D.new()
			collision.shape = circle
			circle.radius = radius * prop_scale
			node.add_child(collision)
		world.add_child(node)


func _place_reference_atlas() -> void:
	var sheet := Sprite2D.new()
	sheet.name = "ApprovedAtlasReference"
	sheet.texture = load(ATLAS_PATH)
	sheet.centered = true
	sheet.position = Vector2(terrain.texture.get_size().x * 0.5 + sheet.texture.get_width() * 0.5 + 96.0, 0.0)
	sheet.modulate = Color(1, 1, 1, 0.92)
	world.add_child(sheet)


func _build_water_collision() -> void:
	var image := _load_png(WATER_MASK_PATH)
	if image == null:
		return
	var bitmap := BitMap.new()
	bitmap.create_from_image_alpha(image, 0.28)
	var rect := Rect2(Vector2.ZERO, Vector2(image.get_width(), image.get_height()))
	var polygons := bitmap.opaque_to_polygons(rect, 2.0)
	var body := StaticBody2D.new()
	body.name = "WaterCollision"
	body.collision_layer = 1
	body.collision_mask = 0
	var origin := -Vector2(image.get_width(), image.get_height()) * 0.5
	for poly in polygons:
		if poly.size() < 3:
			continue
		var grown := Geometry2D.offset_polygon(poly, 10.0)
		if grown.is_empty():
			grown = [poly]
		for shape_poly in grown:
			if shape_poly.size() < 3:
				continue
			var cs := CollisionPolygon2D.new()
			var pts := PackedVector2Array()
			for point in shape_poly:
				pts.append(point + origin)
			cs.polygon = pts
			body.add_child(cs)
	world.add_child(body)


func _build_map_bounds() -> void:
	var size := terrain.texture.get_size()
	var body := StaticBody2D.new()
	body.name = "MapBounds"
	var thickness := 48.0
	var rects := [
		Rect2(-size.x * 0.5 - thickness, -size.y * 0.5 - thickness, size.x + thickness * 2.0, thickness),
		Rect2(-size.x * 0.5 - thickness, size.y * 0.5, size.x + thickness * 2.0, thickness),
		Rect2(-size.x * 0.5 - thickness, -size.y * 0.5, thickness, size.y),
		Rect2(size.x * 0.5, -size.y * 0.5, thickness, size.y),
	]
	for rect in rects:
		var cs := CollisionShape2D.new()
		var shape := RectangleShape2D.new()
		shape.size = rect.size
		cs.shape = shape
		cs.position = rect.position + rect.size * 0.5
		body.add_child(cs)
	world.add_child(body)


func _place_player() -> void:
	var size := terrain.texture.get_size()
	# Center medallion / plaza on the approved ground map.
	player.position = -size * 0.5 + Vector2(size.x * 0.42, size.y * 0.42)


func _limit_camera() -> void:
	var size := terrain.texture.get_size()
	var atlas := load(ATLAS_PATH) as Texture2D
	var extra_right := 0.0
	if atlas:
		extra_right = atlas.get_width() + 120.0
	camera.limit_left = int(-size.x * 0.5)
	camera.limit_top = int(-size.y * 0.5)
	camera.limit_right = int(size.x * 0.5 + extra_right)
	camera.limit_bottom = int(size.y * 0.5)
	camera.limit_smoothed = true


func _save_screenshot() -> void:
	var image := get_viewport().get_texture().get_image()
	var path := "user://village_preview.png"
	image.save_png(path)
	var abs_path := ProjectSettings.globalize_path(path)
	print("Wrote screenshot ", abs_path)


func _load_png(res_path: String) -> Image:
	var abs_path := ProjectSettings.globalize_path(res_path)
	if not FileAccess.file_exists(abs_path):
		push_warning("Missing PNG %s" % res_path)
		return null
	return Image.load_from_file(abs_path)
