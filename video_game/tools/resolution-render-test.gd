extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var host := VillageSandbox.new()
	host.terrain = Sprite2D.new()
	var content := SceneContentController.new()
	content.setup(host)
	root.add_child(content)
	for size in [Vector2i(100, 100), Vector2i(100, 100), Vector2i(300, 200)]:
		var image := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
		image.fill(Color.RED)
		image.fill_rect(Rect2i(size / 2, size / 2), Color.GREEN)
		host.terrain.texture = ImageTexture.create_from_image(image)
		host.terrain.scale = Vector2(100, 100) / Vector2(size)
		content._clear()
		content._spawn_background_region({"id": "cutout", "points_uv": [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]], "layer": 0})
		for i in 4:
			await process_frame
		await RenderingServer.frame_post_draw
		var pixel := root.get_texture().get_image().get_pixel(25, 25)
		if pixel.g < 0.9 or pixel.r > 0.1:
			push_error("Cutout sampled wrong pixels at resolution " + str(size))
			quit(1)
			return
		assert(content.hit_background_region(Vector2(25, 25)) == "cutout")
		assert(host.world_to_background_pixel(Vector2(-50, 50)) == Vector2.ZERO)
	host.terrain.free()
	host.free()
	print("RESOLUTION PIXEL PASS: default, same-size alternate, nonuniform actual dimensions, cutout alignment, bottom-left origin")
	quit(0)
