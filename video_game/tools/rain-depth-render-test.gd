extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var world := Node2D.new()
	world.y_sort_enabled = true
	root.add_child(world)
	var rain := Node2D.new()
	rain.y_sort_enabled = true
	world.add_child(rain)
	var img := Image.create(100, 100, false, Image.FORMAT_RGBA8)
	img.fill(Color.GREEN)
	var house := Sprite2D.new()
	house.texture = ImageTexture.create_from_image(img)
	house.position = Vector2(100, 100)
	world.add_child(house)
	var script := load("res://scripts/director/rain_depth_batch.gd")
	var back := script.new() as Node2D
	back.position = Vector2(80, 50)
	rain.add_child(back)
	back.add_streak(Vector2(80, 60), Vector2(80, 140), Color.BLUE, 8.0)
	var front := script.new() as Node2D
	front.position = Vector2(120, 150)
	rain.add_child(front)
	front.add_streak(Vector2(120, 60), Vector2(120, 140), Color.BLUE, 8.0)
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var shot := root.get_texture().get_image()
	if shot.get_pixel(80, 100).g < 0.9 or shot.get_pixel(120, 100).b < 0.9:
		push_error("Rain same-layer occlusion failed")
		quit(1)
		return
	back.z_index = 1
	front.z_index = -1
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	shot = root.get_texture().get_image()
	if shot.get_pixel(80, 100).b < 0.9 or shot.get_pixel(120, 100).g < 0.9:
		push_error("Rain explicit layer order failed")
		quit(1)
		return
	print("RAIN DEPTH PIXEL TEST PASS: same-layer front/back and explicit layers")
	quit(0)
