extends Node

## Runtime HUD + input modes for custom ground, water, and walk path.
## Left-click edits; right/middle-drag still pans the camera.

enum Mode { PLAY, WATER, PATH }
enum WaterTool { BRUSH, POLYGON }

const MODE_HELP := {
	Mode.PLAY: "Play: WASD walk. 2 water, 3 path, B load PNG.",
	Mode.WATER: "Water: LMB paint, E erase, Enter apply/close polygon. Right-drag pans.",
	Mode.PATH: "Path: LMB add point, Backspace undo, P play, WASD cancels playback.",
}

var village: Node2D
var mode: Mode = Mode.PLAY
var water_tool: WaterTool = WaterTool.BRUSH
var erase := false
var brush_radius := 18
var path_uv: Array[Vector2] = []

var _poly_uv: Array[Vector2] = []
var _painting := false
var _panel: PanelContainer
var _status: Label
var _mode_buttons: Dictionary = {}
var _hide_box: CheckBox
var _erase_box: CheckBox
var _loop_box: CheckBox
var _ignore_box: CheckBox
var _brush_label: Label
var _picker: Node
var _path_line: Line2D
var _poly_line: Line2D
var _brush_cursor: Node2D


func setup(host: Node2D) -> void:
	village = host
	_build_overlays()
	_build_picker()
	_build_panel()
	_set_mode(Mode.PLAY)
	_set_status("Runtime editor ready. Overrides save to user://.")


func apply_layout(layout: SceneLayout) -> void:
	path_uv.clear()
	for point in layout.path_uv:
		path_uv.append(point)
	village.path_loop = layout.path_loop
	village.path_ignore_collision = layout.path_ignore_collision
	if _loop_box:
		_loop_box.set_pressed_no_signal(layout.path_loop)
	if _ignore_box:
		_ignore_box.set_pressed_no_signal(layout.path_ignore_collision)
	if _hide_box:
		_hide_box.set_pressed_no_signal(layout.hide_baked_props)
	_rebuild_path_line()


func set_path_uv(points: Array) -> void:
	path_uv.clear()
	for item in points:
		if item is Vector2:
			path_uv.append(item)
	_rebuild_path_line()


func write_layout() -> void:
	var layout := SceneLayout.new()
	layout.has_custom_ground = village.using_custom_ground
	layout.has_custom_water = village.using_custom_water
	layout.hide_baked_props = village.hide_baked_props
	layout.path_loop = village.path_loop
	layout.path_ignore_collision = village.path_ignore_collision
	layout.path_uv.clear()
	for point in path_uv:
		layout.path_uv.append(point)
	if village.using_custom_water and village.water_image:
		village.water_image.save_png(SceneLayout.USER_WATER)
	layout.save_user()


func play_path() -> bool:
	if path_uv.size() < 2:
		_set_status("Path needs at least 2 points.")
		return false
	var points := PackedVector2Array()
	for uv in path_uv:
		points.append(village.uv_to_world(uv))
	var ok: bool = village.player.play_path(points, village.path_loop, village.path_ignore_collision)
	if ok:
		_set_status("Playing path (%d points)%s." % [path_uv.size(), " loop" if village.path_loop else ""])
	else:
		_set_status("Could not play path.")
	return ok


func _build_picker() -> void:
	var script := load("res://scripts/png_file_picker.gd") as Script
	_picker = script.new()
	_picker.name = "PngFilePicker"
	add_child(_picker)
	_picker.png_picked.connect(_on_png_picked)
	_picker.pick_failed.connect(_set_status)


func _build_overlays() -> void:
	_path_line = Line2D.new()
	_path_line.name = "PathPreview"
	_path_line.width = 4.0
	_path_line.default_color = Color(1.0, 0.86, 0.45, 0.92)
	_path_line.antialiased = true
	_path_line.z_index = 80
	village.add_child(_path_line)

	_poly_line = Line2D.new()
	_poly_line.name = "WaterPolyPreview"
	_poly_line.width = 2.5
	_poly_line.default_color = Color(0.55, 0.85, 1.0, 0.9)
	_poly_line.antialiased = true
	_poly_line.z_index = 81
	village.add_child(_poly_line)

	var cursor_script := load("res://scripts/brush_cursor.gd") as Script
	_brush_cursor = cursor_script.new()
	_brush_cursor.name = "WaterBrushCursor"
	_brush_cursor.z_index = 82
	village.add_child(_brush_cursor)


func _build_panel() -> void:
	_panel = PanelContainer.new()
	_panel.name = "EditorPanel"
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.anchor_left = 1.0
	_panel.anchor_top = 0.0
	_panel.anchor_right = 1.0
	_panel.anchor_bottom = 0.0
	_panel.offset_left = -300.0
	_panel.offset_right = -16.0
	_panel.offset_top = 16.0
	_panel.offset_bottom = 640.0
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.09, 0.07, 0.92)
	style.border_color = Color(0.32, 0.24, 0.16, 1)
	style.set_border_width_all(2)
	style.set_content_margin_all(10)
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	_panel.add_theme_stylebox_override("panel", style)
	village.hud.add_child(_panel)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	_panel.add_child(box)

	box.add_child(_label("Runtime editor (user://)", 16, true))
	box.add_child(_mode_row())
	box.add_child(_label("Ground", 13, true))
	box.add_child(_button_row([
		["Load PNG", _on_load_ground],
		["Reset ground", _on_reset_ground],
	]))
	_hide_box = _checkbox("Hide sliced props", false, _on_hide_toggled)
	box.add_child(_hide_box)

	box.add_child(_label("Water", 13, true))
	box.add_child(_button_row([
		["Brush", _on_tool_brush],
		["Polygon", _on_tool_polygon],
	]))
	_erase_box = _checkbox("Erase", false, _on_erase_toggled)
	box.add_child(_erase_box)
	var brush_row := HBoxContainer.new()
	brush_row.add_child(_small_button("Brush -", _smaller_brush))
	brush_row.add_child(_small_button("Brush +", _bigger_brush))
	_brush_label = _label("18 px", 13, false)
	brush_row.add_child(_brush_label)
	box.add_child(brush_row)
	box.add_child(_button_row([
		["Apply water", _on_apply_water],
		["Reset water", _on_reset_water],
	]))

	box.add_child(_label("Path", 13, true))
	box.add_child(_button_row([
		["Play path", _on_play_path_button],
		["Stop", _on_stop_path],
	]))
	_loop_box = _checkbox("Loop path", true, _on_loop_toggled)
	box.add_child(_loop_box)
	_ignore_box = _checkbox("Ignore collision on play", true, _on_ignore_toggled)
	box.add_child(_ignore_box)
	box.add_child(_button_row([
		["Undo point", _on_undo_point],
		["Clear path", _on_clear_path],
	]))

	_status = _label(" ", 13, false)
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.custom_minimum_size = Vector2(260, 48)
	box.add_child(_status)


func _mode_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	_mode_buttons[Mode.PLAY] = _small_button("1 Play", _on_mode_play)
	_mode_buttons[Mode.WATER] = _small_button("2 Water", _on_mode_water)
	_mode_buttons[Mode.PATH] = _small_button("3 Path", _on_mode_path)
	for child in _mode_buttons.values():
		child.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(child)
	return row


func _process(_delta: float) -> void:
	if village and village.player:
		var dialog: FileDialog = null
		if _picker and _picker.get_child_count() > 0 and _picker.get_child(0) is FileDialog:
			dialog = _picker.get_child(0)
		village.player.control_enabled = dialog == null or not dialog.visible
	if mode == Mode.WATER and water_tool == WaterTool.BRUSH and _painting:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			_paint_at_mouse()
		else:
			_painting = false
			village.commit_water(true)
	_update_cursor()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_1:
				_set_mode(Mode.PLAY)
			KEY_2:
				_set_mode(Mode.WATER)
			KEY_3:
				_set_mode(Mode.PATH)
			KEY_B:
				_on_load_ground()
			KEY_H:
				_hide_box.button_pressed = not _hide_box.button_pressed
			KEY_E:
				if mode == Mode.WATER:
					_erase_box.button_pressed = not _erase_box.button_pressed
			KEY_BRACKETLEFT:
				_smaller_brush()
			KEY_BRACKETRIGHT:
				_bigger_brush()
			KEY_ENTER, KEY_KP_ENTER:
				if mode == Mode.WATER:
					_close_or_apply_water()
			KEY_P:
				if village.player.is_playing_path():
					village.player.stop_path()
					_set_status("Path stopped. WASD is back.")
				else:
					play_path()
			KEY_L:
				_loop_box.button_pressed = not _loop_box.button_pressed
			KEY_X:
				if mode == Mode.PATH:
					_on_clear_path()
			KEY_BACKSPACE:
				_on_undo_point()
			KEY_ESCAPE:
				if village.player.is_playing_path():
					village.player.stop_path()
					_set_status("Path stopped.")
				elif mode != Mode.PLAY:
					_set_mode(Mode.PLAY)
			_:
				return
		get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if mode == Mode.WATER:
			if water_tool == WaterTool.BRUSH:
				_painting = event.pressed
				if event.pressed:
					_paint_at_mouse()
				else:
					village.commit_water(true)
				get_viewport().set_input_as_handled()
			elif event.pressed:
				_add_poly_point()
				get_viewport().set_input_as_handled()
		elif mode == Mode.PATH and event.pressed:
			_add_path_point()
			get_viewport().set_input_as_handled()


func _set_mode(next: Mode) -> void:
	if mode == Mode.WATER and next != Mode.WATER and _painting:
		_painting = false
		village.commit_water(true)
	mode = next
	if mode != Mode.WATER:
		_poly_uv.clear()
		_rebuild_poly_line()
	for key in _mode_buttons:
		var button: Button = _mode_buttons[key]
		button.modulate = Color(1.15, 0.95, 0.55) if key == mode else Color.WHITE
	_set_status(MODE_HELP[mode])
	_update_cursor()


func _set_water_tool(tool: WaterTool) -> void:
	water_tool = tool
	_set_mode(Mode.WATER)
	_set_status("Water %s. E erases. Enter applies or closes the polygon." % ("brush" if tool == WaterTool.BRUSH else "polygon"))


func _on_mode_play() -> void:
	_set_mode(Mode.PLAY)


func _on_mode_water() -> void:
	_set_mode(Mode.WATER)


func _on_mode_path() -> void:
	_set_mode(Mode.PATH)


func _on_tool_brush() -> void:
	_set_water_tool(WaterTool.BRUSH)


func _on_tool_polygon() -> void:
	_set_water_tool(WaterTool.POLYGON)


func _on_play_path_button() -> void:
	play_path()


func _on_load_ground() -> void:
	_set_mode(Mode.PLAY)
	_picker.pick()


func _on_png_picked(bytes: PackedByteArray, filename: String) -> void:
	var note: String = village.apply_ground_png_bytes(bytes, true)
	_hide_box.set_pressed_no_signal(village.hide_baked_props)
	_set_status("%s  (%s)" % [note, filename])
	_rebuild_path_line()


func _on_reset_ground() -> void:
	village.reset_ground()
	_hide_box.set_pressed_no_signal(false)
	_set_status("Restored approved ground and default water.")
	_rebuild_path_line()


func _on_hide_toggled(pressed: bool) -> void:
	village.set_hide_baked_props(pressed)
	village.persist_layout()


func _on_erase_toggled(pressed: bool) -> void:
	erase = pressed
	_update_cursor()


func _on_apply_water() -> void:
	_close_or_apply_water()


func _on_reset_water() -> void:
	_poly_uv.clear()
	_rebuild_poly_line()
	village.reset_water(true)
	_set_status("Water mask reset.")


func _on_stop_path() -> void:
	village.player.stop_path()
	_set_status("Path stopped. WASD is back.")


func _on_loop_toggled(pressed: bool) -> void:
	village.path_loop = pressed
	village.persist_layout()


func _on_ignore_toggled(pressed: bool) -> void:
	village.path_ignore_collision = pressed
	village.persist_layout()


func _on_undo_point() -> void:
	if mode == Mode.WATER and not _poly_uv.is_empty():
		_poly_uv.pop_back()
		_rebuild_poly_line()
		_set_status("Removed last water vertex (%d)." % _poly_uv.size())
		return
	if path_uv.is_empty():
		return
	path_uv.pop_back()
	village.persist_layout()
	_rebuild_path_line()
	_set_status("Removed last path point (%d)." % path_uv.size())


func _on_clear_path() -> void:
	path_uv.clear()
	village.player.stop_path()
	village.persist_layout()
	_rebuild_path_line()
	_set_status("Path cleared.")


func _smaller_brush() -> void:
	brush_radius = maxi(4, brush_radius - 4)
	_brush_label.text = "%d px" % brush_radius
	_update_cursor()


func _bigger_brush() -> void:
	brush_radius = mini(64, brush_radius + 4)
	_brush_label.text = "%d px" % brush_radius
	_update_cursor()


func _close_or_apply_water() -> void:
	if water_tool == WaterTool.POLYGON and _poly_uv.size() >= 3:
		village.fill_water_polygon_uv(PackedVector2Array(_poly_uv), erase)
		_poly_uv.clear()
		_rebuild_poly_line()
		_set_status("Filled water polygon and rebuilt collision.")
		return
	village.commit_water(true)
	_set_status("Applied water collision.")


func _paint_at_mouse() -> void:
	var pixel: Vector2i = village.world_to_pixel(village.get_global_mouse_position())
	village.stamp_water(pixel, brush_radius, erase)


func _add_poly_point() -> void:
	var mouse := village.get_global_mouse_position()
	var uv: Vector2 = village.world_to_uv(mouse)
	if _poly_uv.size() >= 3:
		var first := village.uv_to_world(_poly_uv[0])
		if first.distance_to(mouse) <= 18.0:
			village.fill_water_polygon_uv(PackedVector2Array(_poly_uv), erase)
			_poly_uv.clear()
			_rebuild_poly_line()
			_set_status("Closed water polygon and rebuilt collision.")
			return
	_poly_uv.append(uv)
	_rebuild_poly_line()
	_set_status("Water vertex %d. Click the first point or Enter to close." % _poly_uv.size())


func _add_path_point() -> void:
	var uv: Vector2 = village.world_to_uv(village.get_global_mouse_position())
	path_uv.append(uv)
	village.persist_layout()
	_rebuild_path_line()
	_set_status("Path point %d at UV (%.2f, %.2f)." % [path_uv.size(), uv.x, uv.y])


func _rebuild_path_line() -> void:
	if _path_line == null:
		return
	_path_line.clear_points()
	for uv in path_uv:
		_path_line.add_point(village.uv_to_world(uv))


func _rebuild_poly_line() -> void:
	if _poly_line == null:
		return
	_poly_line.clear_points()
	for uv in _poly_uv:
		_poly_line.add_point(village.uv_to_world(uv))
	if _poly_uv.size() >= 2:
		_poly_line.add_point(village.uv_to_world(_poly_uv[0]))


func _update_cursor() -> void:
	if _brush_cursor == null:
		return
	var show := mode == Mode.WATER and water_tool == WaterTool.BRUSH
	_brush_cursor.active = show
	_brush_cursor.erase = erase
	_brush_cursor.radius = float(brush_radius)
	_brush_cursor.visible = show
	if show:
		_brush_cursor.global_position = village.get_global_mouse_position()
	_brush_cursor.queue_redraw()


func _set_status(text: String) -> void:
	if _status:
		_status.text = text
	print("editor: ", text)


func _label(text: String, size: int, bold_color: bool) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(1.0, 0.96, 0.84) if bold_color else Color(0.92, 0.88, 0.78))
	label.add_theme_color_override("font_outline_color", Color(0.14, 0.1, 0.06))
	label.add_theme_constant_override("outline_size", 4)
	return label


func _checkbox(text: String, pressed: bool, handler: Callable) -> CheckBox:
	var box := CheckBox.new()
	box.text = text
	box.button_pressed = pressed
	box.focus_mode = Control.FOCUS_NONE
	box.toggled.connect(handler)
	return box


func _small_button(text: String, handler: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(0, 28)
	button.pressed.connect(handler)
	return button


func _button_row(items: Array) -> HBoxContainer:
	var row := HBoxContainer.new()
	for item in items:
		var button := _small_button(str(item[0]), item[1] as Callable)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(button)
	return row
