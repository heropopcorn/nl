class_name DirectorDesk
extends Control

## Runtime director desk HUD: scenes, box water, one actor route, rain, preview.

enum Mode { SELECT, BOX_WATER, EDIT_ROUTE, PREVIEW }
enum DragKind { NONE, WATER_MOVE, WATER_RESIZE, WATER_DIR, ROUTE_POINT, BOX }

const HANDLE := 8.0
const TOP_H := 48.0
const BOTTOM_H := 64.0
const LEFT_W := 240.0
const RIGHT_W := 320.0
const NARROW := 900.0
const HELP_TEXT := """导演台 P0

左栏管理多个场景（新建 / 打开 / 重命名 / 删除）。数据保存在本机 user://director_desk/，不是云存档。

水域：点击「框选水域」后在画布拖出矩形。每个水域可设流向、流速和碰撞。相邻可以共边，但不能面积重叠。

角色：每场 1 人。可选农夫或蓝衣农夫，点击「编辑路线」后在画布加点。播放从出生点出发。

天气：仅下雨，强度只影响画面。

底栏：回到开头 / 播放 / 暂停 / 停止。预览时不能改水域或路线。WASD 仍可取消预览并走位，不会改已存路线。

Space 播放或暂停，Esc 取消或停止，Ctrl+S 保存，Ctrl+Z 撤销。"""

var village: VillageSandbox
var repo: SceneRepository
var model: DirectorSceneModel
var mode: Mode = Mode.SELECT
var water: WaterRegionController
var actors := ActorController.new()
var weather: WeatherController
var gizmos: DirectorGizmos
var preview := PreviewController.new()
var undo := DirectorUndoStack.new()

var selected_water_id := ""
var selected_point := -2
var _search_query := ""
var _save_status := "saved"
var _status_text := ""
var _narrow := false
var _left_open := false
var _right_open := false
var _loading := false
var _dirty := false
var _command_before: Dictionary = {}
var _drag := DragKind.NONE
var _drag_corner := 0
var _box_a := Vector2.ZERO
var _box_b := Vector2.ZERO
var _pick_reason := ""
var _pending_bytes: PackedByteArray = PackedByteArray()
var _pending_filename := ""
var _pending_open_id := ""
var _new_source := "preset"

var _save_timer: Timer
var _picker: Node
var _top: PanelContainer
var _left: PanelContainer
var _right: PanelContainer
var _bottom: PanelContainer
var _scene_name_label: Label
var _save_label: Label
var _status_label: Label
var _transport_label: Label
var _search_edit: LineEdit
var _scene_box: VBoxContainer
var _tabs: TabContainer
var _empty_label: Label
var _play_btn: Button
var _loop_box: CheckBox
var _drawer_scene_btn: Button
var _drawer_prop_btn: Button
var _mode_btns: Dictionary = {}
var _help: AcceptDialog
var _new_dialog: ConfirmationDialog
var _new_name: LineEdit
var _rename_dialog: ConfirmationDialog
var _rename_edit: LineEdit
var _rename_id := ""
var _delete_dialog: ConfirmationDialog
var _delete_id := ""
var _conflict_dialog: ConfirmationDialog


func setup(host: VillageSandbox) -> void:
	village = host
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = _make_theme()
	_build_world_helpers()
	_build_picker()
	_build_hud()
	_build_dialogs()
	_save_timer = Timer.new()
	_save_timer.one_shot = true
	_save_timer.wait_time = 0.3
	_save_timer.timeout.connect(_flush_save)
	add_child(_save_timer)
	village.player.path_ended.connect(_on_path_ended)
	if get_viewport():
		get_viewport().size_changed.connect(_apply_layout)
	village.hide_legacy_water()
	_apply_layout()
	_set_save_status("saved")
	_set_status("导演台已就绪。数据保存在本机。")


func boot() -> void:
	boot_with(SceneRepository.new())


func boot_with(p_repo: SceneRepository) -> void:
	repo = p_repo
	repo.ensure_root()
	repo.maybe_migrate_v1()
	if repo.recovered_from_backup:
		_set_status(repo.last_warning)
	repo.ensure_example_if_empty()
	var active := repo.active_scene_id()
	if active.is_empty():
		_set_empty_scene()
	else:
		open_scene(active, true)
	_refresh_scene_list()


func open_scene(scene_id: String, force: bool = false) -> void:
	if not force and model and _dirty and not model.is_valid():
		_pending_open_id = scene_id
		_conflict_dialog.dialog_text = "当前场景有未修正的问题（%s）。请选择修正，或放弃未保存修改。" % model.errors[0]
		_conflict_dialog.popup_centered()
		return
	if not force:
		_flush_save()
	var loaded := repo.load_scene(scene_id)
	if loaded == null:
		_set_status(repo.last_error if not repo.last_error.is_empty() else "无法打开场景")
		return
	if repo.recovered_from_backup:
		_set_status("已从备份恢复")
	_apply_loaded_model(loaded)
	repo.set_active_scene_id(scene_id)


func render_gizmos(canvas: Node2D) -> void:
	if model == null:
		return
	var zoom := 1.0
	if village.camera:
		zoom = maxf(village.camera.zoom.x, 0.2)
	var handle := HANDLE / zoom
	if _drag == DragKind.BOX:
		var rect := _normalized_world_rect(_box_a, _box_b)
		canvas.draw_rect(rect, Color(0.45, 0.85, 1.0, 0.18), true)
		canvas.draw_rect(rect, Color(0.55, 0.9, 1.0, 0.95), false, 2.0 / zoom)
	var overlap_ids := {}
	for pair in model.overlapping_pairs():
		overlap_ids[str(pair[0])] = true
		overlap_ids[str(pair[1])] = true
	for region in model.water_regions:
		var rid := str(region.get("id", ""))
		var rect := water.world_rect_of(region)
		var color := Color(1.0, 0.28, 0.22, 0.95) if overlap_ids.has(rid) else Color(0.45, 0.85, 1.0, 0.7)
		canvas.draw_rect(rect, color, false, 2.0 / zoom if rid != selected_water_id else 3.0 / zoom)
		if rid == selected_water_id:
			_draw_handles(canvas, rect, handle)
			_draw_flow_arrow(canvas, region, rect, handle)
	var actor := actors.first_actor(model)
	if not actor.is_empty():
		var start := village.uv_to_world(DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV))
		canvas.draw_circle(start, handle * 1.2, Color(1.0, 0.86, 0.4, 0.95))
		var route: Dictionary = actor.get("route", {})
		var pts: Array = route.get("points_uv", [])
		var prev := start
		for i in range(pts.size()):
			var p := village.uv_to_world(DirectorSceneModel._vec2(pts[i], Vector2.ZERO))
			canvas.draw_line(prev, p, Color(1.0, 0.82, 0.38, 0.9), 3.0 / zoom, true)
			canvas.draw_circle(p, handle, Color(1.0, 0.92, 0.55, 1))
			prev = p


func run_runtime_selftest() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var temp := SceneRepository.new("user://director_desk_selftest/runtime_%d/" % Time.get_ticks_usec())
	temp.v1_json_path = temp.root + "no_v1.json"
	boot_with(temp)
	if model == null:
		errors.append("boot should create 示例村庄")
		return errors
	var first_id := model.scene_id
	var blank := temp.create_blank_scene("空白测试")
	if blank == null:
		errors.append("runtime blank create failed")
		return errors
	open_scene(blank.scene_id, true)
	if str(model.background.get("source", "")) != "blank":
		errors.append("blank scene source")
	open_scene(first_id, true)
	if model.scene_id != first_id:
		errors.append("scene switch lost first id")
	_begin_cmd()
	_add_water(Rect2(0.10, 0.20, 0.18, 0.16), Vector2(0, 1), "water_a")
	_add_water(Rect2(0.28, 0.20, 0.18, 0.16), Vector2(1, 0), "water_b")
	_end_cmd()
	_sync_world()
	var dir_a := water.material_flow_dir("water_a")
	var dir_b := water.material_flow_dir("water_b")
	if dir_a.dot(Vector2(0, 1)) < 0.9 or dir_b.dot(Vector2(1, 0)) < 0.9:
		errors.append("water materials not isolated at create")
	_begin_cmd()
	_set_water_flow("water_a", Vector2(-1, 0))
	_end_cmd()
	_sync_world()
	dir_a = water.material_flow_dir("water_a")
	dir_b = water.material_flow_dir("water_b")
	if dir_a.dot(Vector2(-1, 0)) < 0.9:
		errors.append("water A flow did not update")
	if dir_b.dot(Vector2(1, 0)) < 0.9:
		errors.append("changing A must not change B")
	_begin_cmd()
	_add_water(Rect2(0.12, 0.22, 0.18, 0.16), Vector2(0, 1), "water_overlap")
	_end_cmd()
	if not model.has_water_overlap():
		errors.append("overlap should be detected")
	if _flush_save():
		errors.append("overlap must not save")
	if _try_play():
		errors.append("overlap must not play")
	# remove overlap water
	_begin_cmd()
	_remove_water("water_overlap")
	_end_cmd()
	if model.has_water_overlap():
		errors.append("shared-edge pair became overlap after removing third")
	model.editor["water_collision_enabled"] = false
	_sync_world()
	if water.get_child_count() < 2:
		errors.append("water sprites should remain with collision off")
	var bodies := 0
	for child in water.get_children():
		if child is StaticBody2D:
			bodies += 1
	if bodies != 0:
		errors.append("global collision off should drop bodies")
	model.editor["water_collision_enabled"] = true
	_sync_world()
	_begin_cmd()
	_set_actor("farmer_placeholder", Vector2(0.20, 0.70), [Vector2(0.20, 0.70), Vector2(0.45, 0.70), Vector2(0.70, 0.70)])
	_end_cmd()
	_sync_world()
	var start_pos := village.player.position
	if not _try_play():
		errors.append("route play failed")
	else:
		for _i in 20:
			await village.get_tree().physics_frame
		if village.player.position.distance_to(start_pos) < 6.0:
			errors.append("actor did not move on play")
		var paused_at := village.player.position
		_pause_preview()
		for _i in 8:
			await village.get_tree().physics_frame
		if village.player.position.distance_to(paused_at) > 2.0:
			errors.append("pause jumped the actor")
		_try_play()
		for _i in 8:
			await village.get_tree().physics_frame
		_stop_preview(true)
		if village.player.position.distance_to(village.uv_to_world(Vector2(0.20, 0.70))) > 6.0:
			errors.append("stop should return to start_uv")
	_begin_cmd()
	if not model.actors.is_empty():
		model.actors[0]["character_id"] = CharacterRegistry.FARMER_BLUE
	_end_cmd()
	_sync_world()
	if not village.player.get_node("Sprite2D").modulate.is_equal_approx(CharacterRegistry.modulate_color(CharacterRegistry.FARMER_BLUE)):
		errors.append("blue farmer modulate missing")
	if str(model.actors[0].get("character_id", "")) != CharacterRegistry.FARMER_BLUE:
		errors.append("character_id not saved in model")
	_begin_cmd()
	model.weather["enabled"] = true
	model.weather["type"] = "rain"
	model.weather["intensity"] = 0.9
	_end_cmd()
	weather.apply(model)
	if not weather.is_raining():
		errors.append("rain was not enabled")
	# undo 50
	var before := model.to_dict()
	for i in 12:
		_begin_cmd()
		if model.water_regions.size() > 0:
			var rect := DirectorSceneModel.rect_from_region(model.water_regions[0])
			rect.position.y = clampf(rect.position.y + 0.002, 0.0, 0.8)
			model.water_regions[0]["rect_uv"] = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
		_end_cmd()
	for i in 12:
		_undo()
	var after := model.to_dict()
	if str(before["water_regions"]) != str(after["water_regions"]):
		errors.append("undo did not restore water rects")
	var img := Image.create(4000, 2000, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.2, 0.35, 0.25, 1))
	var uploaded := temp.create_uploaded_scene("缩放背景", img.save_png_to_buffer(), "big.png")
	if uploaded == null or uploaded.pixel_size() != Vector2i(2048, 1024):
		errors.append("runtime upload resize failed")
	else:
		open_scene(uploaded.scene_id, true)
		if village.terrain_size() != Vector2(2048, 1024):
			errors.append("village bounds not matching 2048x1024, got %s" % village.terrain_size())
	if DisplayServer.get_name() != "headless":
		await village._await_render()
		village._save_screenshot("director_desk_preview.png")
	return errors


func _build_world_helpers() -> void:
	water = WaterRegionController.new()
	village.world.add_child(water)
	water.setup(village)
	weather = WeatherController.new()
	village.add_child(weather)
	weather.setup()
	gizmos = DirectorGizmos.new()
	gizmos.desk = self
	gizmos.name = "DirectorGizmos"
	village.add_child(gizmos)


func _build_picker() -> void:
	var script := load("res://scripts/png_file_picker.gd") as Script
	_picker = script.new()
	_picker.name = "ImagePicker"
	add_child(_picker)
	_picker.png_picked.connect(_on_image_picked)
	_picker.pick_failed.connect(_on_pick_failed)


func _build_hud() -> void:
	_top = _chrome_panel()
	_left = _chrome_panel()
	_right = _chrome_panel()
	_bottom = _chrome_panel()
	add_child(_top)
	add_child(_left)
	add_child(_right)
	add_child(_bottom)
	_fill_top()
	_fill_left()
	_fill_right()
	_fill_bottom()
	_empty_label = _label("暂无场景，点击「新建场景」开始编排。", 16, true)
	_empty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_empty_label.anchor_left = 0.5
	_empty_label.anchor_right = 0.5
	_empty_label.anchor_top = 0.5
	_empty_label.anchor_bottom = 0.5
	_empty_label.offset_left = -220
	_empty_label.offset_right = 220
	_empty_label.offset_top = -20
	_empty_label.offset_bottom = 20
	_empty_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_empty_label.visible = false
	add_child(_empty_label)


func _fill_top() -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_top.add_child(row)
	row.add_child(_label("导演台", 18, true))
	_scene_name_label = _label("未选择场景", 15, false)
	_scene_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_scene_name_label)
	_save_label = _label("已保存", 13, false)
	row.add_child(_save_label)
	row.add_child(_btn("撤销", _undo))
	row.add_child(_btn("重做", _redo))
	_drawer_scene_btn = _btn("场景", func() -> void: _toggle_drawer(true))
	_drawer_prop_btn = _btn("属性", func() -> void: _toggle_drawer(false))
	row.add_child(_drawer_scene_btn)
	row.add_child(_drawer_prop_btn)
	row.add_child(_btn("帮助", _show_help))


func _fill_left() -> void:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	_left.add_child(box)
	box.add_child(_label("场景", 15, true))
	_search_edit = LineEdit.new()
	_search_edit.placeholder_text = "搜索场景"
	_search_edit.focus_mode = Control.FOCUS_CLICK
	_search_edit.text_changed.connect(func(text: String) -> void:
		_search_query = text
		_refresh_scene_list()
	)
	box.add_child(_search_edit)
	box.add_child(_btn("新建场景", _open_new_dialog))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(0, 240)
	box.add_child(scroll)
	_scene_box = VBoxContainer.new()
	_scene_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_scene_box)
	_status_label = _label(" ", 13, false)
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.custom_minimum_size = Vector2(200, 64)
	box.add_child(_status_label)


func _fill_right() -> void:
	_tabs = TabContainer.new()
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right.add_child(_tabs)
	_tabs.add_child(_make_scroll("场景"))
	_tabs.add_child(_make_scroll("水域"))
	_tabs.add_child(_make_scroll("角色"))
	_tabs.add_child(_make_scroll("天气"))
	_tabs.tab_changed.connect(func(_i: int) -> void: _refresh_inspector())


func _fill_bottom() -> void:
	var col := VBoxContainer.new()
	_bottom.add_child(col)
	var modes := HBoxContainer.new()
	_mode_btns[Mode.SELECT] = _btn("选择", func() -> void: _set_mode(Mode.SELECT))
	_mode_btns[Mode.BOX_WATER] = _btn("框选水域", func() -> void: _set_mode(Mode.BOX_WATER))
	_mode_btns[Mode.EDIT_ROUTE] = _btn("编辑路线", func() -> void: _set_mode(Mode.EDIT_ROUTE))
	for child in _mode_btns.values():
		child.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		modes.add_child(child)
	col.add_child(modes)
	var transport := HBoxContainer.new()
	transport.add_child(_btn("回到开头", func() -> void: _stop_preview(false)))
	_play_btn = _btn("播放", func() -> void: _toggle_play())
	transport.add_child(_play_btn)
	transport.add_child(_btn("停止", func() -> void: _stop_preview(true)))
	_loop_box = _checkbox("循环预览", false, func(v: bool) -> void: preview.loop_preview = v)
	transport.add_child(_loop_box)
	_transport_label = _label("已停止", 13, false)
	transport.add_child(_transport_label)
	col.add_child(transport)


func _make_scroll(title: String) -> ScrollContainer:
	var scroll := ScrollContainer.new()
	scroll.name = title
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var inner := VBoxContainer.new()
	inner.name = "Inner"
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(inner)
	return scroll


func _build_dialogs() -> void:
	_help = AcceptDialog.new()
	_help.title = "帮助"
	_help.dialog_text = HELP_TEXT
	_help.min_size = Vector2(520, 360)
	add_child(_help)
	_new_dialog = ConfirmationDialog.new()
	_new_dialog.title = "新建场景"
	_new_dialog.confirmed.connect(_confirm_new_scene)
	var nb := VBoxContainer.new()
	_new_name = LineEdit.new()
	_new_name.placeholder_text = "场景名称"
	nb.add_child(_new_name)
	var sources := HBoxContainer.new()
	sources.add_child(_btn("村庄预设", func() -> void: _new_source = "preset"))
	sources.add_child(_btn("空白画布", func() -> void: _new_source = "blank"))
	sources.add_child(_btn("上传背景", func() -> void:
		_new_source = "uploaded"
		_pick_reason = "new"
		_picker.pick()
	))
	nb.add_child(sources)
	_new_dialog.add_child(nb)
	add_child(_new_dialog)
	_rename_dialog = ConfirmationDialog.new()
	_rename_dialog.title = "重命名"
	_rename_edit = LineEdit.new()
	_rename_dialog.add_child(_rename_edit)
	_rename_dialog.confirmed.connect(_confirm_rename)
	add_child(_rename_dialog)
	_delete_dialog = ConfirmationDialog.new()
	_delete_dialog.title = "删除场景"
	_delete_dialog.confirmed.connect(_confirm_delete)
	add_child(_delete_dialog)
	_conflict_dialog = ConfirmationDialog.new()
	_conflict_dialog.title = "未保存的问题"
	_conflict_dialog.ok_button_text = "放弃未保存修改"
	_conflict_dialog.cancel_button_text = "修正问题"
	_conflict_dialog.confirmed.connect(_abandon_and_open)
	add_child(_conflict_dialog)


func _process(delta: float) -> void:
	if village and village.player:
		village.player.control_enabled = not _shortcuts_blocked()
	preview.tick(delta, preview.is_paused())
	if water:
		water.set_director_time(preview.director_time)
	if weather:
		weather.set_paused(preview.is_paused())
	if _transport_label:
		_transport_label.text = preview.status_text()
	if _play_btn:
		_play_btn.text = "暂停" if preview.is_playing() else "播放"


func _unhandled_input(event: InputEvent) -> void:
	if _shortcuts_blocked():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var key_event := event as InputEventKey
		var key: Key = key_event.physical_keycode
		var cmd: bool = key_event.ctrl_pressed or key_event.meta_pressed
		if cmd and key == KEY_S:
			_flush_save()
			get_viewport().set_input_as_handled()
			return
		if cmd and key == KEY_Z and key_event.shift_pressed:
			_redo()
			get_viewport().set_input_as_handled()
			return
		if cmd and key == KEY_Z:
			_undo()
			get_viewport().set_input_as_handled()
			return
		if cmd and key == KEY_Y:
			_redo()
			get_viewport().set_input_as_handled()
			return
		if key == KEY_SPACE:
			_toggle_play()
			get_viewport().set_input_as_handled()
			return
		if key == KEY_F1:
			_show_help()
			get_viewport().set_input_as_handled()
			return
		if key == KEY_ESCAPE:
			_on_escape()
			get_viewport().set_input_as_handled()
			return
		if key == KEY_BACKSPACE and mode == Mode.EDIT_ROUTE:
			_pop_route_point()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_on_left_mouse(event)
		return
	if event is InputEventMouseMotion:
		_on_mouse_move(event)


func _on_left_mouse(event: InputEventMouseButton) -> void:
	if model == null or _preview_locked_edits():
		if event.pressed and _preview_locked_edits():
			_set_status("预览中不能编辑水域或路线。")
		return
	var world := village.get_global_mouse_position()
	if event.pressed:
		if mode == Mode.BOX_WATER:
			_drag = DragKind.BOX
			_box_a = world
			_box_b = world
			get_viewport().set_input_as_handled()
			return
		if mode == Mode.EDIT_ROUTE:
			_click_route(world)
			get_viewport().set_input_as_handled()
			return
		_click_select(world)
		get_viewport().set_input_as_handled()
	else:
		if _drag == DragKind.BOX:
			_finish_box()
		elif _drag != DragKind.NONE:
			_end_cmd()
			_sync_world()
		_drag = DragKind.NONE
		get_viewport().set_input_as_handled()


func _on_mouse_move(_event: InputEventMouseMotion) -> void:
	if model == null or _preview_locked_edits():
		return
	var world := village.get_global_mouse_position()
	if _drag == DragKind.BOX:
		_box_b = world
	elif _drag == DragKind.WATER_MOVE:
		_drag_move_water(world)
	elif _drag == DragKind.WATER_RESIZE:
		_drag_resize_water(world)
	elif _drag == DragKind.WATER_DIR:
		_drag_water_dir(world)
	elif _drag == DragKind.ROUTE_POINT:
		_drag_route_point(world)


func _click_select(world: Vector2) -> void:
	var actor := actors.first_actor(model)
	if not actor.is_empty():
		var idx := _hit_route_index(world, actor)
		if idx >= -1:
			selected_point = idx
			selected_water_id = ""
			_begin_cmd()
			_drag = DragKind.ROUTE_POINT
			_tabs.current_tab = 2
			_refresh_inspector()
			return
	var rid := water.hit_region(world, model)
	if not rid.is_empty():
		selected_water_id = rid
		selected_point = -2
		_tabs.current_tab = 1
		var region := _water_by_id(rid)
		var rect := water.world_rect_of(region)
		_begin_cmd()
		if _near(world, _arrow_tip(region, rect)):
			_drag = DragKind.WATER_DIR
		else:
			var corner := _hit_corner(rect, world)
			if corner >= 0:
				_drag = DragKind.WATER_RESIZE
				_drag_corner = corner
			else:
				_drag = DragKind.WATER_MOVE
		_refresh_inspector()
		return
	selected_water_id = ""
	selected_point = -2
	_refresh_inspector()


func _click_route(world: Vector2) -> void:
	if actors.first_actor(model).is_empty():
		_set_status("请先添加角色。")
		return
	var actor := actors.first_actor(model)
	var idx := _hit_route_index(world, actor)
	if idx >= -1:
		selected_point = idx
		_begin_cmd()
		_drag = DragKind.ROUTE_POINT
		return
	_begin_cmd()
	var uv := _maybe_snap_uv(village.world_to_uv(world))
	var route: Dictionary = actor.get("route", {})
	var pts: Array = route.get("points_uv", [])
	pts.append(DirectorSceneModel.vec2_to_arr(uv))
	route["points_uv"] = pts
	actor["route"] = route
	_end_cmd()
	_set_status("已添加路线点 %d。" % pts.size())


func _finish_box() -> void:
	_drag = DragKind.NONE
	var rect := _normalized_world_rect(_box_a, _box_b)
	var zoom := village.camera.zoom.x if village.camera else 1.0
	if rect.size.x * zoom < 8.0 or rect.size.y * zoom < 8.0:
		_set_status("框太小，未创建水域。")
		return
	var uv := _world_to_uv_rect(rect)
	var px := village.terrain_size()
	if uv.size.x * px.x < 8.0 or uv.size.y * px.y < 8.0:
		_set_status("水域矩形过小（至少 8×8 像素）")
		return
	_begin_cmd()
	var id := DirectorSceneModel.new_hex_id("water_", 4)
	_add_water(uv, Vector2(0, 1), id)
	selected_water_id = id
	_end_cmd()
	_sync_world()
	_tabs.current_tab = 1
	_refresh_inspector()
	if model.has_water_overlap():
		_set_status("水域不能重叠")
	else:
		_set_status("已创建水域。")


func _apply_loaded_model(loaded: DirectorSceneModel) -> void:
	_loading = true
	model = loaded
	undo.clear()
	_dirty = false
	selected_water_id = ""
	selected_point = -2
	preview.state = PreviewController.State.STOPPED
	preview.entered_preview = false
	village.player.stop_path("replace")
	_sync_world()
	_loading = false
	_set_save_status("saved")
	_refresh_all()
	if loaded.legacy_water != null:
		_set_status("旧版水域：请重新框选")
	var actor := actors.first_actor(model)
	if not actor.is_empty() and not CharacterRegistry.is_known(str(actor.get("character_id", ""))):
		_set_status("找不到角色，已显示默认占位")


func _sync_world() -> void:
	if model == null:
		village.hide_legacy_water()
		water.rebuild(null)
		weather.apply(null)
		_empty_label.visible = true
		return
	_empty_label.visible = false
	_apply_background()
	water.rebuild(model)
	_apply_legacy()
	var actor := actors.first_actor(model)
	if actor.is_empty():
		actors.apply_appearance(village.player, CharacterRegistry.FARMER)
	else:
		actors.apply_appearance(village.player, str(actor.get("character_id", CharacterRegistry.FARMER)))
		if preview.is_stopped():
			actors.place_at_start(village, model)
	weather.apply(model)
	_refresh_mode_buttons()


func _apply_background() -> void:
	var source := str(model.background.get("source", "preset"))
	var show_props := bool(model.editor.get("show_baked_props", source == "preset"))
	if source == "preset":
		village.load_approved_ground(not show_props)
		return
	var file_name := str(model.background.get("file", "background.png"))
	var path := repo.resolve_scene_file(model.scene_id, file_name)
	if path.is_empty() or not FileAccess.file_exists(path):
		village.load_approved_ground(not show_props)
		_set_status("找不到背景文件，已使用默认村庄。")
		return
	var image := Image.new()
	var bytes := FileAccess.get_file_as_bytes(path)
	if image.load_png_from_buffer(bytes) != OK:
		_set_status("无法解码图片")
		return
	village.apply_director_image(image, not show_props)


func _apply_legacy() -> void:
	if model.legacy_water == null:
		village.hide_legacy_water()
		return
	var data: Dictionary = model.legacy_water
	var rel := str(data.get("mask", "legacy_water_mask.png"))
	var path := repo.resolve_scene_file(model.scene_id, rel)
	if path.is_empty() or not FileAccess.file_exists(path):
		village.hide_legacy_water()
		return
	var image := Image.new()
	if image.load_png_from_buffer(FileAccess.get_file_as_bytes(path)) != OK:
		village.hide_legacy_water()
		return
	var flow := DirectorSceneModel._vec2(data.get("flow_dir", [0.18, 0.92]), Vector2(0.18, 0.92))
	village.show_legacy_water(image, flow)


func _set_empty_scene() -> void:
	model = null
	undo.clear()
	village.hide_legacy_water()
	water.rebuild(null)
	weather.apply(null)
	_empty_label.visible = true
	_scene_name_label.text = "未选择场景"
	_refresh_all()


func _refresh_all() -> void:
	_refresh_scene_list()
	_refresh_inspector()
	_refresh_mode_buttons()
	if model:
		_scene_name_label.text = model.name
	_play_btn.disabled = model == null or model.has_water_overlap()


func _refresh_scene_list() -> void:
	if _scene_box == null or repo == null:
		return
	for child in _scene_box.get_children():
		_scene_box.remove_child(child)
		child.free()
	if model == null:
		_scene_name_label.text = "未选择场景"
	for entry in repo.list_entries():
		var name := str(entry.get("name", ""))
		if not _search_query.is_empty() and name.findn(_search_query) < 0:
			continue
		_scene_box.add_child(_scene_card(entry))


func _scene_card(entry: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	var row := HBoxContainer.new()
	panel.add_child(row)
	var thumb := TextureRect.new()
	thumb.custom_minimum_size = Vector2(72, 40)
	thumb.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	thumb.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var thumb_rel := str(entry.get("thumbnail", ""))
	if not thumb_rel.is_empty():
		var tpath := repo.root + thumb_rel
		if FileAccess.file_exists(tpath):
			var img := Image.new()
			if img.load_png_from_buffer(FileAccess.get_file_as_bytes(tpath)) == OK:
				thumb.texture = ImageTexture.create_from_image(img)
	row.add_child(thumb)
	var col := VBoxContainer.new()
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := _label(str(entry.get("name", "")), 13, true)
	col.add_child(title)
	col.add_child(_label(str(entry.get("updated_at", "")).replace("T", " ").substr(0, 16), 11, false))
	row.add_child(col)
	var sid := str(entry.get("id", ""))
	var open_btn := _btn("打开", func() -> void: open_scene(sid))
	row.add_child(open_btn)
	var menu := MenuButton.new()
	menu.text = "…"
	menu.get_popup().add_item("重命名", 0)
	menu.get_popup().add_item("删除", 1)
	menu.get_popup().id_pressed.connect(func(id: int) -> void:
		if id == 0:
			_open_rename(sid, str(entry.get("name", "")))
		elif id == 1:
			_open_delete(sid, str(entry.get("name", "")))
	)
	row.add_child(menu)
	if model and sid == model.scene_id:
		panel.modulate = Color(1.15, 1.05, 0.8)
	return panel


func _refresh_inspector() -> void:
	if _tabs == null:
		return
	_loading = true
	_fill_scene_tab()
	_fill_water_tab()
	_fill_actor_tab()
	_fill_weather_tab()
	_loading = false


func _tab_inner(index: int) -> VBoxContainer:
	var scroll: ScrollContainer = _tabs.get_child(index)
	return scroll.get_node("Inner") as VBoxContainer


func _clear_inner(inner: VBoxContainer) -> void:
	while inner.get_child_count() > 0:
		var child := inner.get_child(0)
		inner.remove_child(child)
		child.free()


func _fill_scene_tab() -> void:
	var inner := _tab_inner(0)
	_clear_inner(inner)
	inner.add_child(_label("场景", 14, true))
	if model == null:
		inner.add_child(_label("没有打开的场景。", 13, false))
		return
	inner.add_child(_btn("上传背景", _open_replace_background))
	inner.add_child(_btn("空白画布", _replace_with_blank))
	inner.add_child(_checkbox("显示内置道具", bool(model.editor.get("show_baked_props", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		model.editor["show_baked_props"] = v
		_end_cmd()
		_sync_world()
	))
	inner.add_child(_checkbox("水面碰撞", bool(model.editor.get("water_collision_enabled", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		model.editor["water_collision_enabled"] = v
		_end_cmd()
		_sync_world()
	))
	inner.add_child(_btn("恢复默认", func() -> void:
		_begin_cmd()
		model.background = {
			"source": "preset",
			"preset_id": DirectorSceneModel.PRESET_VILLAGE,
			"file": null,
			"pixel_size": [DirectorSceneModel.PRESET_PIXEL.x, DirectorSceneModel.PRESET_PIXEL.y],
		}
		model.editor["show_baked_props"] = true
		_end_cmd()
		_sync_world()
	))
	if model.legacy_water != null:
		inner.add_child(_label("旧版水域：请重新框选", 13, false))
		inner.add_child(_btn("删除旧版水域", func() -> void:
			_begin_cmd()
			model.legacy_water = null
			_end_cmd()
			_sync_world()
		))
	if str(model.background.get("original_file_name", "")) != "":
		inner.add_child(_label("原文件：" + str(model.background.get("original_file_name", "")), 12, false))


func _fill_water_tab() -> void:
	var inner := _tab_inner(1)
	_clear_inner(inner)
	inner.add_child(_label("水域", 14, true))
	inner.add_child(_btn("框选水域", func() -> void: _set_mode(Mode.BOX_WATER)))
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		inner.add_child(_label("在画布框选或点选一块水域。", 13, false))
		return
	inner.add_child(_label("流向", 13, true))
	var dirs := [
		["上", Vector2(0, -1)], ["下", Vector2(0, 1)], ["左", Vector2(-1, 0)], ["右", Vector2(1, 0)],
		["左上", Vector2(-1, -1)], ["右上", Vector2(1, -1)], ["左下", Vector2(-1, 1)], ["右下", Vector2(1, 1)],
	]
	var grid := GridContainer.new()
	grid.columns = 4
	for item in dirs:
		var d: Vector2 = item[1]
		grid.add_child(_btn(str(item[0]), func() -> void:
			_begin_cmd()
			_set_water_flow(selected_water_id, d)
			_end_cmd()
			_sync_world()
		))
	inner.add_child(grid)
	inner.add_child(_label("流速", 13, true))
	var speed := HSlider.new()
	speed.min_value = 0
	speed.max_value = 1.5
	speed.step = 0.01
	speed.value = float(region.get("flow_speed", 0.22))
	speed.drag_started.connect(func() -> void: _begin_cmd())
	speed.value_changed.connect(func(v: float) -> void:
		if _loading: return
		region["flow_speed"] = v
		_sync_world()
	)
	speed.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(speed)
	inner.add_child(_checkbox("启用碰撞", bool(region.get("collision_enabled", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		region["collision_enabled"] = v
		_end_cmd()
		_sync_world()
	))
	inner.add_child(_btn("删除水域", func() -> void:
		_begin_cmd()
		_remove_water(selected_water_id)
		selected_water_id = ""
		_end_cmd()
		_sync_world()
		_refresh_inspector()
	))


func _fill_actor_tab() -> void:
	var inner := _tab_inner(2)
	_clear_inner(inner)
	inner.add_child(_label("角色", 14, true))
	inner.add_child(_btn("添加角色", _add_actor_clicked))
	var actor := actors.first_actor(model) if model else {}
	if actor.is_empty():
		inner.add_child(_label("尚未添加角色。P0 每场 1 人。", 13, false))
		return
	inner.add_child(_label("角色类型", 13, true))
	var opt := OptionButton.new()
	opt.add_item("农夫", 0)
	opt.add_item("蓝衣农夫", 1)
	opt.select(0 if str(actor.get("character_id", "")) != CharacterRegistry.FARMER_BLUE else 1)
	opt.item_selected.connect(func(index: int) -> void:
		if _loading: return
		_begin_cmd()
		actor["character_id"] = CharacterRegistry.FARMER if index == 0 else CharacterRegistry.FARMER_BLUE
		_end_cmd()
		_sync_world()
	)
	inner.add_child(opt)
	inner.add_child(_btn("编辑路线", func() -> void: _set_mode(Mode.EDIT_ROUTE)))
	inner.add_child(_label("速度", 13, true))
	var speed := HSlider.new()
	var route: Dictionary = actor.get("route", {})
	speed.min_value = 20
	speed.max_value = 600
	speed.step = 1
	speed.value = float(route.get("speed_px_per_sec", 210))
	speed.drag_started.connect(func() -> void: _begin_cmd())
	speed.value_changed.connect(func(v: float) -> void:
		if _loading: return
		route["speed_px_per_sec"] = v
		actor["route"] = route
	)
	speed.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(speed)
	inner.add_child(_checkbox("循环", bool(route.get("loop", false)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		route["loop"] = v
		actor["route"] = route
		_end_cmd()
	))
	inner.add_child(_checkbox("忽略碰撞", str(route.get("collision_mode", "ignore")) == "ignore", func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		route["collision_mode"] = "ignore" if v else "world"
		actor["route"] = route
		_end_cmd()
	))
	inner.add_child(_btn("删除角色", func() -> void:
		_begin_cmd()
		model.actors.clear()
		_end_cmd()
		_sync_world()
		_refresh_inspector()
	))


func _fill_weather_tab() -> void:
	var inner := _tab_inner(3)
	_clear_inner(inner)
	inner.add_child(_label("天气", 14, true))
	if model == null:
		return
	inner.add_child(_checkbox("启用天气", bool(model.weather.get("enabled", false)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		model.weather["enabled"] = v
		_end_cmd()
		weather.apply(model)
	))
	inner.add_child(_label("天气效果：下雨", 13, false))
	inner.add_child(_label("强度", 13, true))
	var sl := HSlider.new()
	sl.min_value = 0
	sl.max_value = 1
	sl.step = 0.01
	sl.value = float(model.weather.get("intensity", 0.6))
	sl.drag_started.connect(func() -> void: _begin_cmd())
	sl.value_changed.connect(func(v: float) -> void:
		if _loading: return
		model.weather["intensity"] = v
		weather.apply(model)
	)
	sl.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(sl)


func _add_actor_clicked() -> void:
	if model == null:
		return
	if model.actors.size() >= 1:
		_set_status("P0 每场只能有一个角色。")
		return
	_begin_cmd()
	_set_actor(CharacterRegistry.FARMER, village.world_to_uv(village.player.position), [])
	_end_cmd()
	_sync_world()
	_tabs.current_tab = 2
	_refresh_inspector()
	_set_status("已添加角色，可编辑路线。")


func _set_mode(next: Mode) -> void:
	if next != Mode.PREVIEW and preview.entered_preview and preview.is_playing():
		return
	mode = next
	_refresh_mode_buttons()
	match mode:
		Mode.SELECT:
			_set_status("选择：左键选对象，右键拖动画布。")
		Mode.BOX_WATER:
			_set_status("框选水域：拖出矩形。Esc 取消。")
		Mode.EDIT_ROUTE:
			_set_status("编辑路线：左键加点，Backspace 删末点。")
		Mode.PREVIEW:
			_set_status("预览中：编辑已锁定。Space 播放/暂停。")


func _refresh_mode_buttons() -> void:
	for key in _mode_btns:
		var button: Button = _mode_btns[key]
		button.modulate = Color(1.15, 0.95, 0.55) if key == mode else Color.WHITE
		button.disabled = model == null


func _toggle_play() -> void:
	if preview.is_playing():
		_pause_preview()
	else:
		_try_play()


func _try_play() -> bool:
	if model == null:
		return false
	if model.has_water_overlap():
		_set_status("水域不能重叠")
		return false
	var actor := actors.first_actor(model)
	if not actors.can_play(actor):
		_set_status("路线至少需要 2 个点才能播放")
		return false
	if preview.is_paused() and village.player.is_playing_path():
		village.player.resume_path()
		preview.state = PreviewController.State.PLAYING
		_set_mode(Mode.PREVIEW)
		return true
	var points := actors.playback_world_points(village, actor)
	if points.size() < 2:
		_set_status("路线至少需要 2 个点才能播放")
		return false
	var route: Dictionary = actor.get("route", {})
	var ignore := str(route.get("collision_mode", "ignore")) != "world"
	var speed := float(route.get("speed_px_per_sec", 210))
	preview.mark_enter_preview(mode if mode != Mode.PREVIEW else preview.previous_mode)
	if not village.player.play_path(points, bool(route.get("loop", false)), ignore, speed):
		_set_status("无法播放路线")
		return false
	preview.state = PreviewController.State.PLAYING
	preview.clock = 0.0
	_set_mode(Mode.PREVIEW)
	_set_status("播放中")
	return true


func _pause_preview() -> void:
	if not village.player.is_playing_path():
		return
	village.player.pause_path()
	preview.state = PreviewController.State.PAUSED
	_set_status("已暂停")


func _stop_preview(change_mode: bool) -> void:
	village.player.stop_path("stop")
	preview.state = PreviewController.State.STOPPED
	preview.clock = 0.0
	if model:
		actors.place_at_start(village, model)
	if change_mode and preview.entered_preview:
		var prev := preview.mark_leave_preview()
		_set_mode(prev as Mode)
	else:
		preview.entered_preview = false
	_set_status("已停止")


func _on_path_ended(reason: String) -> void:
	if reason == "replace" or reason == "stop":
		return
	if reason == "cancel":
		preview.state = PreviewController.State.STOPPED
		if preview.entered_preview:
			_set_mode(preview.mark_leave_preview() as Mode)
		_set_status("已停止预览，WASD 走位不会改路线")
		return
	if reason == "end":
		if preview.loop_preview:
			_try_play()
			return
		preview.state = PreviewController.State.STOPPED
		if preview.entered_preview:
			_set_mode(preview.mark_leave_preview() as Mode)
		_set_status("播放结束")


func _on_escape() -> void:
	if preview.is_playing() or preview.is_paused() or mode == Mode.PREVIEW:
		_stop_preview(true)
		return
	if _drag == DragKind.BOX:
		_drag = DragKind.NONE
		return
	if mode != Mode.SELECT:
		_set_mode(Mode.SELECT)


func _preview_locked_edits() -> bool:
	return mode == Mode.PREVIEW or preview.is_playing() or preview.is_paused()


func _begin_cmd() -> void:
	if _loading or model == null:
		return
	if _command_before.is_empty():
		_command_before = model.to_dict()


func _end_cmd() -> void:
	if _loading or model == null or _command_before.is_empty():
		_command_before = {}
		return
	var now := model.to_dict()
	if JSON.stringify(_command_before) == JSON.stringify(now):
		_command_before = {}
		return
	undo.record_past(_command_before)
	_command_before = {}
	_dirty = true
	_set_save_status("saving")
	_save_timer.start()
	_refresh_scene_list()
	_play_btn.disabled = model.has_water_overlap()
	if model.has_water_overlap():
		_set_status("水域不能重叠")


func _undo() -> void:
	if not undo.can_undo() or model == null:
		return
	var prev := undo.undo(model.to_dict())
	if prev.is_empty():
		return
	_apply_snapshot(prev)
	_set_status("已撤销")


func _redo() -> void:
	if not undo.can_redo() or model == null:
		return
	var nxt := undo.redo(model.to_dict())
	if nxt.is_empty():
		return
	_apply_snapshot(nxt)
	_set_status("已重做")


func _apply_snapshot(data: Dictionary) -> void:
	_loading = true
	model = DirectorSceneModel.from_dict(data)
	_loading = false
	_dirty = true
	_sync_world()
	_set_save_status("saving")
	_save_timer.start()
	_refresh_all()


func _flush_save() -> bool:
	if model == null:
		return true
	model.validate()
	if not model.is_valid():
		_set_save_status("failed")
		_set_status(model.errors[0])
		return false
	var thumb: Image = null
	if village.terrain.texture:
		var src := village.terrain.texture.get_image()
		if src:
			thumb = DirectorImages.make_thumbnail(src)
	if not repo.save_scene(model, null, thumb):
		_set_save_status("failed")
		_set_status(repo.last_error if not repo.last_error.is_empty() else "保存失败")
		return false
	_dirty = false
	_set_save_status("saved")
	_refresh_scene_list()
	return true


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_EXIT_TREE:
		_flush_save()


func _open_new_dialog() -> void:
	_new_source = "preset"
	_pending_bytes = PackedByteArray()
	_pending_filename = ""
	_new_name.text = ""
	_new_dialog.popup_centered()
	_new_name.grab_focus()


func _confirm_new_scene() -> void:
	if repo == null:
		return
	_flush_save()
	var scene: DirectorSceneModel = null
	match _new_source:
		"blank":
			scene = repo.create_blank_scene(_new_name.text)
		"uploaded":
			if _pending_bytes.is_empty():
				_set_status("请先选择图片")
				return
			scene = repo.create_uploaded_scene(_new_name.text, _pending_bytes, _pending_filename)
		_:
			scene = repo.create_preset_scene(_new_name.text)
	if scene == null:
		_set_status(repo.last_error if not repo.last_error.is_empty() else "无法创建场景")
		return
	if not repo.last_warning.is_empty():
		_set_status(repo.last_warning)
	open_scene(scene.scene_id, true)


func _open_rename(scene_id: String, current: String) -> void:
	_rename_id = scene_id
	_rename_edit.text = current
	_rename_dialog.popup_centered()
	_rename_edit.grab_focus()


func _confirm_rename() -> void:
	if not repo.rename_scene(_rename_id, _rename_edit.text):
		_set_status(repo.last_error if not repo.last_error.is_empty() else "场景名称须为 1–40 个字符")
		return
	if model and model.scene_id == _rename_id:
		model.name = _rename_edit.text.strip_edges()
	_refresh_all()


func _open_delete(scene_id: String, current: String) -> void:
	_delete_id = scene_id
	_delete_dialog.dialog_text = "确定删除场景「%s」？此操作不可撤销。" % current
	_delete_dialog.popup_centered()


func _confirm_delete() -> void:
	var deleting_current := model != null and model.scene_id == _delete_id
	if not repo.delete_scene(_delete_id):
		_set_status("删除失败")
		return
	if deleting_current:
		var entries := repo.list_entries()
		if entries.is_empty():
			_set_empty_scene()
		else:
			open_scene(str(entries[0].get("id", "")), true)
	_refresh_scene_list()
	_set_status("已删除场景。")


func _abandon_and_open() -> void:
	_dirty = false
	var target := _pending_open_id
	_pending_open_id = ""
	if not target.is_empty():
		open_scene(target, true)


func _open_replace_background() -> void:
	_pick_reason = "replace"
	_pending_bytes = PackedByteArray()
	_picker.pick()


func _replace_with_blank() -> void:
	if model == null:
		return
	var image := DirectorImages.make_blank(DirectorSceneModel.BLANK_PIXEL, DirectorSceneModel.BLANK_FILL)
	var path := repo.resolve_scene_file(model.scene_id, "background.png")
	if path.is_empty():
		_set_status("背景路径不安全")
		return
	image.save_png(path)
	_begin_cmd()
	model.background = {
		"source": "blank",
		"preset_id": null,
		"file": "background.png",
		"fill_color": DirectorSceneModel.color_to_arr(DirectorSceneModel.BLANK_FILL),
		"pixel_size": [image.get_width(), image.get_height()],
	}
	model.editor["show_baked_props"] = false
	_end_cmd()
	_sync_world()


func _on_image_picked(bytes: PackedByteArray, filename: String) -> void:
	if bytes.size() > DirectorImages.MAX_BYTES:
		_set_status("图片文件超过 12 MiB")
		return
	if _pick_reason == "replace" and model:
		var decoded := DirectorImages.decode_upload(bytes)
		if not bool(decoded["ok"]):
			_set_status(str(decoded.get("error", "无法解码图片")))
			return
		var image: Image = decoded["image"]
		_begin_cmd()
		var path := repo.resolve_scene_file(model.scene_id, "background.png")
		if path.is_empty():
			_set_status("背景路径不安全")
			return
		image.save_png(path)
		model.background["source"] = "uploaded"
		model.background["preset_id"] = null
		model.background["file"] = "background.png"
		model.background["original_file_name"] = filename
		model.background["pixel_size"] = [image.get_width(), image.get_height()]
		model.editor["show_baked_props"] = false
		_end_cmd()
		_sync_world()
		if not str(decoded.get("warning", "")).is_empty():
			_set_status(str(decoded["warning"]))
		return
	_pending_bytes = bytes
	_pending_filename = filename
	_new_source = "uploaded"
	_set_status("已选择 %s" % filename)


func _on_pick_failed(message: String) -> void:
	_set_status(message)


func _add_water(uv: Rect2, dir: Vector2, id: String) -> void:
	var flow := DirectorSceneModel.normalize_flow(dir)
	model.water_regions.append({
		"id": id,
		"name": "水域",
		"enabled": true,
		"rect_uv": [DirectorSceneModel.snap6(uv.position.x), DirectorSceneModel.snap6(uv.position.y), DirectorSceneModel.snap6(uv.size.x), DirectorSceneModel.snap6(uv.size.y)],
		"flow_dir": DirectorSceneModel.vec2_to_arr(flow),
		"flow_speed": 0.22,
		"collision_enabled": true,
	})


func _remove_water(id: String) -> void:
	for i in range(model.water_regions.size() - 1, -1, -1):
		if str(model.water_regions[i].get("id", "")) == id:
			model.water_regions.remove_at(i)


func _set_water_flow(id: String, dir: Vector2) -> void:
	var region := _water_by_id(id)
	if region.is_empty():
		return
	region["flow_dir"] = DirectorSceneModel.vec2_to_arr(DirectorSceneModel.normalize_flow(dir))


func _set_actor(character_id: String, start: Vector2, points: Array) -> void:
	var pts: Array = []
	for item in points:
		pts.append(DirectorSceneModel.vec2_to_arr(item))
	if model.actors.is_empty():
		model.actors.append({
			"id": DirectorSceneModel.new_hex_id("actor_", 4),
			"character_id": character_id,
			"display_name": CharacterRegistry.display_name(character_id),
			"enabled": true,
			"start_uv": DirectorSceneModel.vec2_to_arr(start),
			"route": {
				"points_uv": pts,
				"speed_px_per_sec": 210.0,
				"loop": false,
				"collision_mode": "ignore",
			},
		})
	else:
		model.actors[0]["character_id"] = character_id
		model.actors[0]["start_uv"] = DirectorSceneModel.vec2_to_arr(start)
		model.actors[0]["route"]["points_uv"] = pts


func _water_by_id(id: String) -> Dictionary:
	if model == null or id.is_empty():
		return {}
	for region in model.water_regions:
		if str(region.get("id", "")) == id:
			return region
	return {}


func _drag_move_water(world: Vector2) -> void:
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		return
	var rect := DirectorSceneModel.rect_from_region(region)
	var uv := _maybe_snap_uv(village.world_to_uv(world))
	rect.position = uv - rect.size * 0.5
	rect.position.x = clampf(rect.position.x, 0.0, 1.0 - rect.size.x)
	rect.position.y = clampf(rect.position.y, 0.0, 1.0 - rect.size.y)
	region["rect_uv"] = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]


func _drag_resize_water(world: Vector2) -> void:
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		return
	var rect := water.world_rect_of(region)
	var p := world
	match _drag_corner:
		0:
			rect.size += rect.position - p
			rect.position = p
		1:
			rect.size.x = p.x - rect.position.x
			rect.size.y += rect.position.y - p.y
			rect.position.y = p.y
		2:
			rect.size = p - rect.position
		3:
			rect.size.y = p.y - rect.position.y
			rect.size.x += rect.position.x - p.x
			rect.position.x = p.x
	var uv := _world_to_uv_rect(rect.abs())
	var px := village.terrain_size()
	uv.size.x = maxf(uv.size.x, 8.0 / px.x)
	uv.size.y = maxf(uv.size.y, 8.0 / px.y)
	region["rect_uv"] = [uv.position.x, uv.position.y, uv.size.x, uv.size.y]


func _drag_water_dir(world: Vector2) -> void:
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		return
	var rect := water.world_rect_of(region)
	var center := rect.position + rect.size * 0.5
	_set_water_flow(selected_water_id, world - center)


func _drag_route_point(world: Vector2) -> void:
	var actor := actors.first_actor(model)
	if actor.is_empty():
		return
	var uv := _maybe_snap_uv(village.world_to_uv(world))
	if selected_point == -1:
		actor["start_uv"] = DirectorSceneModel.vec2_to_arr(uv)
	elif selected_point >= 0:
		var route: Dictionary = actor.get("route", {})
		var pts: Array = route.get("points_uv", [])
		if selected_point < pts.size():
			pts[selected_point] = DirectorSceneModel.vec2_to_arr(uv)
			route["points_uv"] = pts
			actor["route"] = route


func _pop_route_point() -> void:
	var actor := actors.first_actor(model)
	if actor.is_empty():
		return
	var route: Dictionary = actor.get("route", {})
	var pts: Array = route.get("points_uv", [])
	if pts.is_empty():
		return
	_begin_cmd()
	pts.pop_back()
	route["points_uv"] = pts
	actor["route"] = route
	_end_cmd()


func _hit_route_index(world: Vector2, actor: Dictionary) -> int:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var lim := HANDLE * 1.6 / zoom
	var start := village.uv_to_world(DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV))
	if world.distance_to(start) <= lim:
		return -1
	var pts: Array = actor.get("route", {}).get("points_uv", [])
	for i in range(pts.size()):
		var p := village.uv_to_world(DirectorSceneModel._vec2(pts[i], Vector2.ZERO))
		if world.distance_to(p) <= lim:
			return i
	return -2


func _hit_corner(rect: Rect2, world: Vector2) -> int:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var lim := HANDLE * 1.5 / zoom
	var pts := [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]
	for i in range(pts.size()):
		if world.distance_to(pts[i]) <= lim:
			return i
	return -1


func _draw_handles(canvas: Node2D, rect: Rect2, handle: float) -> void:
	var pts := [rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]
	for p in pts:
		canvas.draw_rect(Rect2(p - Vector2(handle, handle) * 0.5, Vector2(handle, handle)), Color(1, 1, 1, 0.95), true)
	canvas.draw_circle(rect.position + rect.size * 0.5, handle * 0.7, Color(1, 0.9, 0.5, 0.95))


func _draw_flow_arrow(canvas: Node2D, region: Dictionary, rect: Rect2, handle: float) -> void:
	var tip := _arrow_tip(region, rect)
	var center := rect.position + rect.size * 0.5
	canvas.draw_line(center, tip, Color(0.95, 0.95, 1.0, 0.95), 2.0, true)
	canvas.draw_circle(tip, handle * 0.6, Color(0.9, 0.95, 1.0, 1))


func _arrow_tip(region: Dictionary, rect: Rect2) -> Vector2:
	var flow := DirectorSceneModel.normalize_flow(DirectorSceneModel._vec2(region.get("flow_dir", [0, 1]), Vector2(0, 1)))
	var center := rect.position + rect.size * 0.5
	var length := minf(rect.size.x, rect.size.y) * 0.42
	return center + flow * length


func _world_to_uv_rect(rect: Rect2) -> Rect2:
	var a := village.world_to_uv(rect.position)
	var b := village.world_to_uv(rect.position + rect.size)
	var mn := Vector2(minf(a.x, b.x), minf(a.y, b.y))
	var mx := Vector2(maxf(a.x, b.x), maxf(a.y, b.y))
	mn = mn.clamp(Vector2.ZERO, Vector2.ONE)
	mx = mx.clamp(Vector2.ZERO, Vector2.ONE)
	return Rect2(mn, mx - mn)


func _normalized_world_rect(a: Vector2, b: Vector2) -> Rect2:
	var mn := Vector2(minf(a.x, b.x), minf(a.y, b.y))
	var mx := Vector2(maxf(a.x, b.x), maxf(a.y, b.y))
	return Rect2(mn, mx - mn)


func _maybe_snap_uv(uv: Vector2) -> Vector2:
	uv = uv.clamp(Vector2.ZERO, Vector2.ONE)
	if Input.is_key_pressed(KEY_SHIFT) or bool(model.editor.get("snap_enabled", false)):
		var px := village.terrain_size()
		var grid := float(model.editor.get("snap_grid_px", 8))
		uv.x = snappedf(uv.x * px.x, grid) / px.x
		uv.y = snappedf(uv.y * px.y, grid) / px.y
	return uv


func _near(a: Vector2, b: Vector2) -> bool:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	return a.distance_to(b) <= HANDLE * 1.6 / zoom


func _apply_layout() -> void:
	if _top == null:
		return
	var size := get_viewport_rect().size
	_narrow = size.x < NARROW
	_top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_top.offset_bottom = TOP_H
	_bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_bottom.offset_top = -BOTTOM_H
	_drawer_scene_btn.visible = _narrow
	_drawer_prop_btn.visible = _narrow
	if _narrow:
		_left.visible = _left_open
		_right.visible = _right_open
		_left.set_anchors_preset(Control.PRESET_LEFT_WIDE)
		_left.offset_top = TOP_H
		_left.offset_bottom = -BOTTOM_H
		_left.offset_right = LEFT_W
		_right.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
		_right.offset_top = TOP_H
		_right.offset_bottom = -BOTTOM_H
		_right.offset_left = -RIGHT_W
	else:
		_left.visible = true
		_right.visible = true
		_left.set_anchors_preset(Control.PRESET_LEFT_WIDE)
		_left.offset_top = TOP_H
		_left.offset_bottom = -BOTTOM_H
		_left.offset_right = LEFT_W
		_right.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
		_right.offset_top = TOP_H
		_right.offset_bottom = -BOTTOM_H
		_right.offset_left = -RIGHT_W


func _toggle_drawer(left_side: bool) -> void:
	if left_side:
		_left_open = not _left_open
		if _left_open:
			_right_open = false
	else:
		_right_open = not _right_open
		if _right_open:
			_left_open = false
	_apply_layout()


func _shortcuts_blocked() -> bool:
	if _picker and _picker.has_method("is_open") and _picker.is_open():
		return true
	if _new_dialog.visible or _rename_dialog.visible or _delete_dialog.visible or _help.visible or _conflict_dialog.visible:
		return true
	var focus := get_viewport().gui_get_focus_owner()
	return focus is LineEdit or focus is TextEdit


func _show_help() -> void:
	_help.popup_centered()


func _set_status(text: String) -> void:
	_status_text = text
	if _status_label:
		_status_label.text = text
	print("director: ", text)


func _set_save_status(kind: String) -> void:
	_save_status = kind
	if _save_label == null:
		return
	match kind:
		"saving":
			_save_label.text = "保存中…"
		"failed":
			_save_label.text = "保存失败"
		_:
			_save_label.text = "已保存"


func _make_theme() -> Theme:
	var theme := Theme.new()
	var font: Font
	if ResourceLoader.exists("res://fonts/droid_sans_fallback.ttf"):
		font = load("res://fonts/droid_sans_fallback.ttf")
	else:
		var sys := SystemFont.new()
		sys.font_names = PackedStringArray(["WenQuanYi Micro Hei", "Droid Sans Fallback", "Microsoft YaHei", "Noto Sans CJK SC"])
		font = sys
	theme.set_default_font(font)
	theme.set_default_font_size(14)
	return theme


func _chrome_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.10, 0.09, 0.07, 0.94)
	style.border_color = Color(0.32, 0.24, 0.16, 1)
	style.set_border_width_all(2)
	style.set_content_margin_all(8)
	panel.add_theme_stylebox_override("panel", style)
	return panel


func _label(text: String, size: int, bold: bool) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(1.0, 0.96, 0.84) if bold else Color(0.92, 0.88, 0.78))
	label.add_theme_color_override("font_outline_color", Color(0.14, 0.1, 0.06))
	label.add_theme_constant_override("outline_size", 4)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label


func _btn(text: String, handler: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(0, 28)
	button.pressed.connect(handler)
	return button


func _checkbox(text: String, pressed: bool, handler: Callable) -> CheckBox:
	var box := CheckBox.new()
	box.text = text
	box.button_pressed = pressed
	box.focus_mode = Control.FOCUS_NONE
	box.toggled.connect(handler)
	return box
