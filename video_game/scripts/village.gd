class_name VillageSandbox
extends Node2D

## First village sandbox: orthographic ground + a few isometric atlas props.
## Runtime editor overlays live in user:// (see scripts/runtime_editor.gd).

const GROUND_PATH := "res://art/approved/chatgpt-terrain-ground-approved.png"
const WATER_MASK_PATH := "res://art/generated/water_mask.png"
const ATLAS_PATH := "res://art/approved/chatgpt-terrain-assets-approved.png"
const SLICED_DIR := "res://art/sliced/"
const MAX_GROUND_EDGE := 2048
const WATER_PAINT := Color(92.0 / 255.0, 168.0 / 255.0, 210.0 / 255.0, 0.72)
const WATER_COLLISION_ALPHA := 0.28

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
@onready var player: VillagePlayer = $World/Player
@onready var camera: Camera2D = $World/Player/Camera2D
@onready var hint: Label = $HUD/ControlsHint
@onready var hud: CanvasLayer = $HUD

var editor: Node
var using_custom_ground := false
var using_custom_water := false
var hide_baked_props := false
var water_image: Image
var water_texture: ImageTexture
var path_loop := true
var path_ignore_collision := true

var _prop_nodes: Array[StaticBody2D] = []
var _atlas_sheet: Sprite2D
var _water_collision: StaticBody2D
var _map_bounds: StaticBody2D


func _ready() -> void:
	hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bind_terrain()
	_bind_water()
	_place_props()
	_place_reference_atlas()
	rebuild_water_collision()
	rebuild_map_bounds()
	_place_player()
	_limit_camera()
	_setup_editor()
	var args := OS.get_cmdline_user_args()
	var selftest := "--selftest" in args
	var take_shot := "--screenshot" in args
	if not selftest and not take_shot:
		load_user_overrides()
	print("Village ready — props spawned, water mask on, player at plaza.")
	if selftest:
		await get_tree().physics_frame
		var code := await _run_selftest()
		get_tree().quit(code)
		return
	if take_shot:
		await _await_render()
		_save_screenshot()
		get_tree().quit()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_F1:
			hint.visible = not hint.visible
		elif event.physical_keycode == KEY_F3:
			get_tree().debug_collisions_hint = not get_tree().debug_collisions_hint


func terrain_size() -> Vector2:
	if terrain.texture == null:
		return Vector2.ZERO
	return terrain.texture.get_size()


func world_to_uv(world_pos: Vector2) -> Vector2:
	var size := terrain_size()
	if size.x <= 1.0 or size.y <= 1.0:
		return Vector2(0.5, 0.5)
	var origin := -size * 0.5
	return ((world_pos - origin) / size).clamp(Vector2.ZERO, Vector2.ONE)


func uv_to_world(uv: Vector2) -> Vector2:
	var size := terrain_size()
	return -size * 0.5 + Vector2(size.x * uv.x, size.y * uv.y)


func world_to_pixel(world_pos: Vector2) -> Vector2i:
	var size := terrain_size()
	var uv := world_to_uv(world_pos)
	return Vector2i(int(uv.x * size.x), int(uv.y * size.y))


func apply_ground_png_bytes(bytes: PackedByteArray, persist: bool = true) -> String:
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		return "Could not decode PNG."
	return apply_ground_image(image, persist, true)


func apply_ground_image(image: Image, persist: bool, hide_props: bool) -> String:
	if image == null or image.is_empty():
		return "Empty image."
	_prepare_image(image)
	var note := ""
	if maxi(image.get_width(), image.get_height()) > MAX_GROUND_EDGE:
		var scale := float(MAX_GROUND_EDGE) / float(maxi(image.get_width(), image.get_height()))
		var next_w := maxi(1, int(image.get_width() * scale))
		var next_h := maxi(1, int(image.get_height() * scale))
		image.resize(next_w, next_h, Image.INTERPOLATE_LANCZOS)
		note = "Resized to %dx%d (max edge %d)." % [next_w, next_h, MAX_GROUND_EDGE]
	var player_uv := world_to_uv(player.position)
	var old_size := terrain_size()
	terrain.texture = ImageTexture.create_from_image(image)
	terrain.centered = true
	using_custom_ground = true
	if persist:
		image.save_png(SceneLayout.USER_GROUND)
	set_hide_baked_props(hide_props)
	_on_ground_size_changed(old_size)
	player.position = uv_to_world(player_uv)
	if persist:
		persist_layout()
	if note.is_empty():
		note = "Ground %dx%d." % [image.get_width(), image.get_height()]
	return note


func reset_ground() -> void:
	var player_uv := world_to_uv(player.position)
	var old_size := terrain_size()
	var tex := load(GROUND_PATH) as Texture2D
	terrain.texture = tex
	terrain.centered = true
	using_custom_ground = false
	set_hide_baked_props(false)
	_on_ground_size_changed(old_size)
	reset_water(false)
	player.position = uv_to_world(player_uv)
	persist_layout()


func set_hide_baked_props(hidden: bool) -> void:
	hide_baked_props = hidden
	for node in _prop_nodes:
		node.visible = not hidden
		node.collision_layer = 0 if hidden else 1


func reset_water(persist: bool = true) -> void:
	if using_custom_ground:
		_blank_water_image(terrain_size())
		using_custom_water = true
	else:
		var image := _load_png(WATER_MASK_PATH)
		if image == null:
			_blank_water_image(terrain_size())
		else:
			_prepare_image(image)
			_set_water_image(image, true)
		using_custom_water = false
	rebuild_water_collision()
	if persist:
		if using_custom_water:
			water_image.save_png(SceneLayout.USER_WATER)
		persist_layout()


func stamp_water(pixel: Vector2i, radius: int, erase: bool) -> void:
	if water_image == null:
		return
	var color := Color(0, 0, 0, 0) if erase else WATER_PAINT
	var r2 := radius * radius
	var w := water_image.get_width()
	var h := water_image.get_height()
	for y in range(maxi(0, pixel.y - radius), mini(h, pixel.y + radius + 1)):
		for x in range(maxi(0, pixel.x - radius), mini(w, pixel.x + radius + 1)):
			var dx := x - pixel.x
			var dy := y - pixel.y
			if dx * dx + dy * dy <= r2:
				water_image.set_pixel(x, y, color)
	_refresh_water_texture()
	using_custom_water = true


func fill_water_polygon_uv(uv_points: PackedVector2Array, erase: bool) -> void:
	if water_image == null or uv_points.size() < 3:
		return
	var size := terrain_size()
	var pixels := PackedVector2Array()
	for uv in uv_points:
		pixels.append(Vector2(uv.x * size.x, uv.y * size.y))
	var color := Color(0, 0, 0, 0) if erase else WATER_PAINT
	var min_x := INF
	var min_y := INF
	var max_x := -INF
	var max_y := -INF
	for point in pixels:
		min_x = minf(min_x, point.x)
		min_y = minf(min_y, point.y)
		max_x = maxf(max_x, point.x)
		max_y = maxf(max_y, point.y)
	var x0 := clampi(int(floor(min_x)), 0, water_image.get_width() - 1)
	var y0 := clampi(int(floor(min_y)), 0, water_image.get_height() - 1)
	var x1 := clampi(int(ceil(max_x)), 0, water_image.get_width() - 1)
	var y1 := clampi(int(ceil(max_y)), 0, water_image.get_height() - 1)
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if Geometry2D.is_point_in_polygon(Vector2(x + 0.5, y + 0.5), pixels):
				water_image.set_pixel(x, y, color)
	_refresh_water_texture()
	using_custom_water = true
	commit_water(true)


func commit_water(persist: bool = true) -> void:
	rebuild_water_collision()
	if persist and using_custom_water and water_image:
		water_image.save_png(SceneLayout.USER_WATER)
	if persist:
		persist_layout()


func water_alpha_at_uv(uv: Vector2) -> float:
	if water_image == null:
		return 0.0
	var x := clampi(int(uv.x * water_image.get_width()), 0, water_image.get_width() - 1)
	var y := clampi(int(uv.y * water_image.get_height()), 0, water_image.get_height() - 1)
	return water_image.get_pixel(x, y).a


func water_collision_count() -> int:
	if _water_collision == null:
		return 0
	return _water_collision.get_child_count()


func persist_layout() -> void:
	if editor and editor.has_method("write_layout"):
		editor.write_layout()
		return
	var layout := SceneLayout.new()
	layout.has_custom_ground = using_custom_ground
	layout.has_custom_water = using_custom_water
	layout.hide_baked_props = hide_baked_props
	layout.path_loop = path_loop
	layout.path_ignore_collision = path_ignore_collision
	layout.save_user()


func load_user_overrides() -> void:
	var layout := SceneLayout.load_user()
	path_loop = layout.path_loop
	path_ignore_collision = layout.path_ignore_collision
	if layout.has_custom_ground:
		var image := _load_png(SceneLayout.USER_GROUND)
		if image:
			apply_ground_image(image, false, layout.hide_baked_props)
	else:
		set_hide_baked_props(layout.hide_baked_props)
	if layout.has_custom_water:
		var mask := _load_png(SceneLayout.USER_WATER)
		if mask and mask.get_width() == int(terrain_size().x) and mask.get_height() == int(terrain_size().y):
			_prepare_image(mask)
			_set_water_image(mask, true)
			using_custom_water = true
			rebuild_water_collision()
	if editor and editor.has_method("apply_layout"):
		editor.apply_layout(layout)


func rebuild_water_collision() -> void:
	if _water_collision:
		world.remove_child(_water_collision)
		_water_collision.free()
		_water_collision = null
	if water_image == null:
		return
	var bitmap := BitMap.new()
	bitmap.create_from_image_alpha(water_image, WATER_COLLISION_ALPHA)
	var rect := Rect2(Vector2.ZERO, Vector2(water_image.get_width(), water_image.get_height()))
	var polygons := bitmap.opaque_to_polygons(rect, 2.0)
	var body := StaticBody2D.new()
	body.name = "WaterCollision"
	body.collision_layer = 1
	body.collision_mask = 0
	var origin := -Vector2(water_image.get_width(), water_image.get_height()) * 0.5
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
	_water_collision = body


func rebuild_map_bounds() -> void:
	if _map_bounds:
		world.remove_child(_map_bounds)
		_map_bounds.free()
		_map_bounds = null
	var size := terrain_size()
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
	_map_bounds = body


func _setup_editor() -> void:
	var script := load("res://scripts/runtime_editor.gd") as Script
	editor = script.new()
	editor.name = "RuntimeEditor"
	hud.add_child(editor)
	editor.call("setup", self)


func _bind_terrain() -> void:
	if terrain.texture == null:
		terrain.texture = load(GROUND_PATH)
	terrain.centered = true
	terrain.z_index = -20
	terrain.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func _bind_water() -> void:
	var image := _load_png(WATER_MASK_PATH)
	if image == null:
		push_warning("Water mask missing; run python3 tools/prepare_art.py")
		_blank_water_image(terrain_size())
		return
	_prepare_image(image)
	_set_water_image(image, true)
	water.centered = true
	water.z_index = -15
	if water.material == null:
		water.material = load("res://resources/water_flow_material.tres")
	water.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR


func _place_props() -> void:
	var ground_size := terrain_size()
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
		node.set_meta("layout_uv", uv)
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
		_prop_nodes.append(node)


func _place_reference_atlas() -> void:
	var sheet := Sprite2D.new()
	sheet.name = "ApprovedAtlasReference"
	sheet.texture = load(ATLAS_PATH)
	sheet.centered = true
	sheet.modulate = Color(1, 1, 1, 0.92)
	world.add_child(sheet)
	_atlas_sheet = sheet
	_reposition_atlas()


func _place_player() -> void:
	player.position = uv_to_world(Vector2(0.42, 0.42))


func _limit_camera() -> void:
	var size := terrain_size()
	var extra_right := 0.0
	if not using_custom_ground and _atlas_sheet and _atlas_sheet.texture:
		extra_right = _atlas_sheet.texture.get_width() + 120.0
	camera.limit_left = int(-size.x * 0.5)
	camera.limit_top = int(-size.y * 0.5)
	camera.limit_right = int(size.x * 0.5 + extra_right)
	camera.limit_bottom = int(size.y * 0.5)
	camera.limit_smoothed = true


func _on_ground_size_changed(old_size: Vector2) -> void:
	var new_size := terrain_size()
	_reposition_props()
	_reposition_atlas()
	rebuild_map_bounds()
	_limit_camera()
	camera.offset = Vector2.ZERO
	if _atlas_sheet:
		_atlas_sheet.visible = not using_custom_ground
	if water_image == null or water_image.get_width() != int(new_size.x) or water_image.get_height() != int(new_size.y):
		if old_size == Vector2.ZERO or using_custom_ground:
			_blank_water_image(new_size)
			using_custom_water = true
		else:
			reset_water(false)
		rebuild_water_collision()


func _reposition_props() -> void:
	var ground_size := terrain_size()
	var origin := -ground_size * 0.5
	for node in _prop_nodes:
		var uv: Vector2 = node.get_meta("layout_uv", Vector2(0.5, 0.5))
		node.position = origin + Vector2(ground_size.x * uv.x, ground_size.y * uv.y)
	set_hide_baked_props(hide_baked_props)


func _reposition_atlas() -> void:
	if _atlas_sheet == null or _atlas_sheet.texture == null:
		return
	var size := terrain_size()
	_atlas_sheet.position = Vector2(size.x * 0.5 + _atlas_sheet.texture.get_width() * 0.5 + 96.0, 0.0)


func _blank_water_image(size: Vector2) -> void:
	var image := Image.create(maxi(1, int(size.x)), maxi(1, int(size.y)), false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	_set_water_image(image, true)


func _set_water_image(image: Image, rebuild_texture: bool) -> void:
	water_image = image
	if rebuild_texture or water_texture == null:
		water_texture = ImageTexture.create_from_image(water_image)
		water.texture = water_texture
	else:
		water_texture.update(water_image)
	water.centered = true


func _refresh_water_texture() -> void:
	if water_texture == null:
		water_texture = ImageTexture.create_from_image(water_image)
		water.texture = water_texture
	else:
		water_texture.update(water_image)


func _prepare_image(image: Image) -> void:
	if image.get_format() != Image.FORMAT_RGBA8:
		image.convert(Image.FORMAT_RGBA8)


func _save_screenshot(filename: String = "village_preview.png") -> String:
	var image := get_viewport().get_texture().get_image()
	var path := "user://%s" % filename
	image.save_png(path)
	var abs_path := ProjectSettings.globalize_path(path)
	print("Wrote screenshot ", abs_path)
	return abs_path


func _await_render() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	RenderingServer.force_draw(true)
	await get_tree().process_frame
	await get_tree().create_timer(0.15).timeout


func _load_png(path: String) -> Image:
	if path.is_empty():
		return null
	var image := Image.new()
	if FileAccess.file_exists(path):
		var bytes := FileAccess.get_file_as_bytes(path)
		if not bytes.is_empty() and image.load_png_from_buffer(bytes) == OK:
			return image
	var abs_path := ProjectSettings.globalize_path(path)
	if abs_path != path and FileAccess.file_exists(abs_path):
		var loaded := Image.load_from_file(abs_path)
		if loaded:
			return loaded
	push_warning("Missing PNG %s" % path)
	return null


func _run_selftest() -> int:
	var errors: PackedStringArray = PackedStringArray()
	var ground := Image.create(480, 320, false, Image.FORMAT_RGBA8)
	ground.fill(Color(0.36, 0.52, 0.28, 1))
	for x in 480:
		for y in range(148, 172):
			ground.set_pixel(x, y, Color(0.45, 0.34, 0.18, 1))
	var note := apply_ground_image(ground, true, true)
	print("selftest ground: ", note)
	if terrain_size() != Vector2(480, 320):
		errors.append("ground size expected 480x320, got %s" % terrain_size())
	if not hide_baked_props:
		errors.append("custom ground should hide baked props")
	if not using_custom_ground:
		errors.append("using_custom_ground should be true")
	if not FileAccess.file_exists(SceneLayout.USER_GROUND):
		errors.append("missing user://custom_ground.png")

	var lake := PackedVector2Array([
		Vector2(0.08, 0.12),
		Vector2(0.42, 0.12),
		Vector2(0.42, 0.48),
		Vector2(0.08, 0.48),
	])
	fill_water_polygon_uv(lake, false)
	if water_alpha_at_uv(Vector2(0.25, 0.30)) < 0.4:
		errors.append("painted water alpha too low")
	if water_alpha_at_uv(Vector2(0.80, 0.80)) > 0.05:
		errors.append("unpainted water should stay empty")
	if water_collision_count() < 1:
		errors.append("expected water collision polygons")
	if not FileAccess.file_exists(SceneLayout.USER_WATER):
		errors.append("missing user://water_mask.png")
	if DisplayServer.get_name() != "headless":
		await _await_render()
		_save_screenshot("village_custom_ground_water.png")

	if editor and editor.has_method("set_path_uv"):
		editor.set_path_uv([Vector2(0.18, 0.80), Vector2(0.82, 0.80)])
	var start := player.position
	var played: bool = editor.call("play_path") if editor else false
	if not played:
		errors.append("path play failed")
	else:
		for _i in 24:
			await get_tree().physics_frame
		if player.position.distance_to(start) < 8.0:
			errors.append("path playback did not move the player")
		if player.collision_mask != 0:
			errors.append("path playback should ignore collision")
		if DisplayServer.get_name() != "headless":
			await _await_render()
			_save_screenshot("village_path_playing.png")
		player.stop_path()
		if player.is_playing_path():
			errors.append("path should stop")
		if player.collision_mask == 0:
			errors.append("WASD collision mask should restore after path")

	reset_ground()
	if using_custom_ground:
		errors.append("reset_ground should restore approved terrain")
	if hide_baked_props:
		errors.append("reset_ground should show baked props")
	if DisplayServer.get_name() != "headless":
		await _await_render()
		_save_screenshot("village_reset_approved.png")

	if errors.is_empty():
		print("SELFTEST PASS")
		return 0
	for item in errors:
		push_error("SELFTEST FAIL: " + item)
		print("SELFTEST FAIL: ", item)
	return 1
