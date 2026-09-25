extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var world := Node2D.new()
	world.y_sort_enabled = true
	root.add_child(world)
	var content := SceneContentController.new()
	content.setup(null)
	world.add_child(content)
	var img := Image.create(100, 100, false, Image.FORMAT_RGBA8)
	img.fill(Color.GREEN)
	var house := Sprite2D.new()
	house.texture = ImageTexture.create_from_image(img)
	house.position = Vector2(100, 100)
	content.add_child(house)
	var original := house.global_transform
	content._apply_sort_line(house, {"sort_offset_y": 20.0}, 100.0)
	assert(house.global_transform.is_equal_approx(original), "Sort line moved image")
	var actor_image := Image.create(10, 80, false, Image.FORMAT_RGBA8)
	actor_image.fill(Color.BLUE)
	var actor := Sprite2D.new()
	actor.texture = ImageTexture.create_from_image(actor_image)
	actor.offset.y = -40
	actor.position = Vector2(100, 110)
	world.add_child(actor)
	await check_pixel(100, 80, false)
	actor.position.y = 130
	await check_pixel(100, 80, true)
	# Explicit layer still takes priority over the line.
	house.get_parent().z_index = 1
	house.z_index = 1
	await check_pixel(100, 80, false)
	var model := DirectorSceneModel.new()
	house.get_parent().free()
	var host := VillageSandbox.new()
	host.terrain = Sprite2D.new()
	var terrain_image := Image.create(400, 400, false, Image.FORMAT_RGBA8)
	terrain_image.fill(Color.GREEN)
	host.terrain.texture = ImageTexture.create_from_image(terrain_image)
	content.village = host
	var region := {"id": "polygon", "points_uv": [[0.625, 0.625], [0.875, 0.625], [0.875, 0.875], [0.625, 0.875]], "layer": 0, "sort_offset_y": 20.0}
	content._spawn_background_region(region)
	assert(content.hit_background_region(Vector2(100, 80)) == "polygon")
	assert(content.hit_background_region(Vector2(100, 180)).is_empty())
	actor.position.y = 110
	await check_pixel(100, 80, false)
	actor.position.y = 130
	await check_pixel(100, 80, true)
	content._clear()
	region.erase("sort_offset_y")
	content._spawn_background_region(region)
	assert(content._region_nodes["polygon"].get_parent() == content, "Legacy pivot changed")
	await check_pixel(100, 80, true)
	host.terrain.free()
	host.free()
	model.elements = [{"id": "tree", "sort_offset_y": -35.0}]
	model.background_regions = [{"id": "cutout", "sort_offset_y": 12.0}]
	var restored := DirectorSceneModel.from_json_text(model.to_json_text())
	assert(restored.elements[0]["sort_offset_y"] == -35.0)
	assert(restored.background_regions[0]["sort_offset_y"] == 12.0)
	assert(DirectorSceneModel._sort_offset({}) == null)
	assert(DirectorSceneModel._sort_offset({"sort_offset_y": "bad"}) == null)
	print("SORT LINE PASS: geometry unchanged, feet crossing, layer priority, persistence, legacy defaults")
	quit(0)

func check_pixel(x: int, y: int, blue: bool) -> void:
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var color := root.get_texture().get_image().get_pixel(x, y)
	if (blue and color.b < 0.9) or (not blue and color.g < 0.9):
		push_error("Sort line occlusion failed: " + str(color))
		quit(1)
