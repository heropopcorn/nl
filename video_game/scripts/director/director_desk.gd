class_name DirectorDesk
extends Control

## Director Desk Layout V3: hierarchy/resources, inspector, project browser and canvas tools.

enum Mode { SELECT, BOX_WATER, LASSO_WATER, LASSO_REGION, LASSO_RAIN, EDIT_ROUTE, SCALE, ROTATE, PREVIEW }
enum DragKind { NONE, WATER_MOVE, WATER_RESIZE, WATER_DIR, WATER_POINT, RAIN_POINT, ROUTE_POINT, ELEMENT_MOVE, ELEMENT_SCALE, ELEMENT_ROTATE, BOX }

const HANDLE := 8.0
const TOP_H := 44.0
const BOTTOM_H := 184.0
const LEFT_W := 250.0
const RIGHT_W := 300.0
const TOOL_W := 82.0
const NARROW := 900.0
const BUILTIN_BACKGROUNDS := [
	{
		"id": "background_protagonist_village",
		"name": "村庄背景",
		"category": "backgrounds",
		"preset_id": DirectorSceneModel.PRESET_PROTAGONIST_VILLAGE,
		"path": "res://art/backgrounds/protagonist_village.png",
	},
	{
		"id": "background_village_school",
		"name": "村庄学校背景",
		"category": "backgrounds",
		"preset_id": DirectorSceneModel.PRESET_VILLAGE_SCHOOL,
		"path": "res://art/backgrounds/village_school.png",
	},
]
const HELP_TEXT := """导演台 Layout V3

左上 Hierarchy 列出当前场景的一切元素；左下资源列表提供默认/自定义资源；底部 Project 左选章节、右开场景。数据保存在本机 user://director_desk/，不是云存档。

元素：从背景、树木、角色和房屋分类添加；自定义页可上传图片。整数层级越高越靠前；同层按脚底 Y 排序。

“矩形水域”拖出规则水面；“套索水域”逐点创建不规则水面；“底图裁片”圈出可独立设置层级的背景区域。双击、回点或 Enter 闭合套索，创建后工具会保持激活，可按 Esc 回到移动。

移动、缩放、旋转采用图像软件习惯：移动保留抓取点；缩放拖四角控制点；旋转拖外圈，Shift 吸附 15°。V 切回移动，Ctrl/Cmd+T 进入缩放，方向键微调。右侧属性也可精确输入。

角色：可添加多人；必须先点选角色，才显示和编辑其路线。每人可独立设置层级、速度、路线显隐与循环，播放时同时行走。

环境：可设置昼夜与月光；下雨可启用随机双段闪电。风具有方向和强度，会显示风迹，并让全屏雨线朝风向偏转；框定区域只定义雨滴终点及是否显示落点水花。

顶栏文件/编辑菜单用于创建和维护内容；播放/停止控制当前场景，播放时编辑锁定。

中键按住可随时平移画布，滚轮以鼠标位置缩放，不会取消正在进行的操作。

Space 播放或暂停，Esc 取消或停止，Ctrl+S 保存，Ctrl+Z 撤销。"""

var village: VillageSandbox
var repo: SceneRepository
var model: DirectorSceneModel
var mode: Mode = Mode.SELECT
var water: WaterRegionController
var actors := ActorController.new()
var content: SceneContentController
var asset_library := DirectorAssetLibrary.new()
var weather: WeatherController
var rain: Node2D
var gizmos: DirectorGizmos
var preview := PreviewController.new()
var undo := DirectorUndoStack.new()

var selected_water_id := ""
var selected_actor_id := ""
var selected_element_id := ""
var selected_region_id := ""
var selected_rain_id := ""
var selected_kind := "background"
var selected_chapter_id := ""
var selected_point := -2
var _lasso_points: PackedVector2Array = PackedVector2Array()
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
var _asset_choice := "tree_oak"
var _asset_category := "houses"
var _resource_scope := "default"
var _asset_drawer_open := true
var _placing_asset := false
var _play_had_actor := false
var _transform_origin := Vector2.ZERO
var _transform_start_distance := 1.0
var _transform_start_scale := 1.0
var _transform_start_pointer_angle := 0.0
var _transform_start_rotation := 0.0
var _drag_world_offset := Vector2.ZERO
var _canvas_panning := false
var _new_rain_splashes := true

var _save_timer: Timer
var _picker: Node
var _top: PanelContainer
var _left: PanelContainer
var _right: PanelContainer
var _bottom: PanelContainer
var _tools: PanelContainer
var _scene_name_label: Label
var _mode_label: Label
var _save_label: Label
var _status_label: Label
var _transport_label: Label
var _search_edit: LineEdit
var _scene_box: Container
var _chapter_box: VBoxContainer
var _hierarchy_box: VBoxContainer
var _hierarchy_rename_btn: Button
var _inspector_title: Label
var _tabs: Control
var _asset_drawer: PanelContainer
var _asset_drawer_button: Button
var _asset_grid: GridContainer
var _asset_category_buttons: Dictionary = {}
var _resource_scope_buttons: Dictionary = {}
var _tab_index := 0
var _tab_btns: Array[Button] = []
var _tab_pages: Array[ScrollContainer] = []
var _last_layout_size := Vector2.ZERO
var _box_a_screen := Vector2.ZERO
var _box_b_screen := Vector2.ZERO
var _empty_label: Label
var _play_btn: Button
var _loop_box: CheckBox
var _drawer_scene_btn: Button
var _drawer_prop_btn: Button
var _mode_btns: Dictionary = {}
var _canvas_catch: ColorRect
var _help: AcceptDialog
var _new_dialog: ConfirmationDialog
var _new_name: LineEdit
var _rename_dialog: ConfirmationDialog
var _rename_edit: LineEdit
var _rename_id := ""
var _delete_dialog: ConfirmationDialog
var _delete_id := ""
var _conflict_dialog: ConfirmationDialog
var _new_chapter_dialog: ConfirmationDialog
var _new_chapter_name: LineEdit
var _rename_chapter_dialog: ConfirmationDialog
var _rename_chapter_edit: LineEdit
var _rename_chapter_id := ""
var _delete_chapter_dialog: ConfirmationDialog
var _delete_chapter_id := ""
var _replace_background_dialog: ConfirmationDialog
var _pending_background_action := ""
var _rename_item_dialog: ConfirmationDialog
var _rename_item_edit: LineEdit
var _rename_item_kind := ""
var _rename_item_id := ""


func setup(host: VillageSandbox) -> void:
	village = host
	asset_library.ensure_root()
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
	selected_chapter_id = repo.active_chapter_id()
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
	selected_chapter_id = repo.chapter_for_scene(scene_id)
	_apply_loaded_model(loaded)
	repo.set_active_scene_id(scene_id)


func render_gizmos(canvas: Node2D) -> void:
	if model == null:
		return
	var zoom := 1.0
	if village.camera:
		zoom = maxf(village.camera.zoom.x, 0.2)
	var handle := HANDLE / zoom
	if selected_kind == "background" and village.terrain.texture:
		var terrain_size := village.terrain_size()
		canvas.draw_rect(Rect2(-terrain_size * 0.5, terrain_size), Color(1.0, 0.82, 0.35, 0.9), false, 3.0 / zoom)
	if _drag == DragKind.BOX:
		var rect := _normalized_world_rect(_box_a, _box_b)
		canvas.draw_rect(rect, Color(0.45, 0.85, 1.0, 0.18), true)
		canvas.draw_rect(rect, Color(0.55, 0.9, 1.0, 0.95), false, 2.0 / zoom)
	if not _lasso_points.is_empty():
		var live := PackedVector2Array()
		for point in _lasso_points:
			live.append(village.uv_to_world(point))
		live.append(village.get_global_mouse_position())
		canvas.draw_polyline(live, Color(0.45, 0.95, 0.72, 0.95), 2.5 / zoom, true)
		for point in live:
			canvas.draw_circle(point, handle * 0.65, Color(0.8, 1.0, 0.88, 1))
	var overlap_ids := {}
	for pair in model.overlapping_pairs():
		overlap_ids[str(pair[0])] = true
		overlap_ids[str(pair[1])] = true
	for region in model.water_regions:
		var rid := str(region.get("id", ""))
		var rect := water.world_rect_of(region)
		var poly := water.world_polygon_of(region)
		var color := Color(1.0, 0.28, 0.22, 0.95) if overlap_ids.has(rid) else Color(0.45, 0.85, 1.0, 0.7)
		if poly.size() >= 3:
			var closed := poly.duplicate()
			closed.append(poly[0])
			canvas.draw_polyline(closed, color, 2.0 / zoom if rid != selected_water_id else 3.0 / zoom, true)
		if rid == selected_water_id:
			if str(region.get("shape", "rect")) == "polygon":
				for point in poly:
					canvas.draw_circle(point, handle * 0.7, Color.WHITE)
			else:
				_draw_handles(canvas, rect, handle)
			_draw_flow_arrow(canvas, region, rect, handle)
	for region in model.background_regions:
		var rid := str(region.get("id", ""))
		var poly := PackedVector2Array()
		for point in DirectorSceneModel.points_from_value(region.get("points_uv", [])):
			poly.append(village.uv_to_world(point))
		if poly.size() >= 3:
			var closed := poly.duplicate()
			closed.append(poly[0])
			canvas.draw_polyline(closed, Color(0.78, 0.52, 1.0, 0.95 if rid == selected_region_id else 0.48), 3.0 / zoom if rid == selected_region_id else 1.5 / zoom, true)
	for region in model.rain_regions:
		var rid := str(region.get("id", ""))
		var poly: PackedVector2Array = rain.world_polygon_of(region)
		if poly.size() >= 3:
			var closed: PackedVector2Array = poly.duplicate()
			closed.append(poly[0])
			canvas.draw_polyline(closed, Color(0.42, 0.76, 1.0, 0.98 if rid == selected_rain_id else 0.52), 3.0 / zoom if rid == selected_rain_id else 1.5 / zoom, true)
			if rid == selected_rain_id:
				for point in poly:
					canvas.draw_circle(point, handle * 0.7, Color(0.82, 0.94, 1.0, 1.0))
	if not selected_element_id.is_empty():
		var marker := content.element_world_position(selected_element_id)
		canvas.draw_circle(marker, handle * 1.15, Color(1.0, 0.55, 0.2, 0.9), false, 2.0 / zoom)
		var corners := content.element_world_corners(selected_element_id)
		if corners.size() == 4:
			var closed := corners.duplicate()
			closed.append(corners[0])
			canvas.draw_polyline(closed, Color(1.0, 0.62, 0.22, 0.92), 2.0 / zoom, true)
			if mode == Mode.SCALE:
				for point in corners:
					canvas.draw_rect(Rect2(point - Vector2.ONE * handle * 0.55, Vector2.ONE * handle * 1.1), Color(1.0, 0.92, 0.72, 1.0), true)
			elif mode == Mode.ROTATE:
				var radius := 0.0
				for point in corners:
					radius = maxf(radius, marker.distance_to(point))
				radius += handle * 2.0
				canvas.draw_arc(marker, radius, 0.0, TAU, 48, Color(1.0, 0.76, 0.3, 0.9), 2.0 / zoom, true)
				var tip := marker + Vector2.RIGHT.rotated(deg_to_rad(content.element_rotation_degrees(selected_element_id))) * radius
				canvas.draw_line(marker, tip, Color(1.0, 0.76, 0.3, 0.9), 2.0 / zoom, true)
				canvas.draw_circle(tip, handle * 0.75, Color(1.0, 0.92, 0.62, 1.0))
	var actor := actors.actor_by_id(model, selected_actor_id)
	if not actor.is_empty() and bool(actor.get("route", {}).get("visible", true)):
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
	var ui_font := theme.default_font
	for required_char in ["章", "套", "索", "停", "树", "屋"]:
		if ui_font == null or not ui_font.has_char(required_char.unicode_at(0)):
			errors.append("ui font missing glyph: %s" % required_char)
	for asset in SceneContentController.ASSETS:
		if str(asset.get("id", "")).is_empty() or str(asset.get("category", "")).is_empty():
			errors.append("asset metadata missing id/category")
			break
	var top_row := _top.get_child(0) as HBoxContainer
	for control in top_row.get_children():
		if control is Button and control.visible and control.size.x < 28.0:
			errors.append("top action collapsed: %s width %.1f" % [(control as Button).text, control.size.x])
		if control.visible and control.position.x + control.size.x > top_row.size.x + 1.0:
			errors.append("top action clipped: %s" % control.name)
	var temp := SceneRepository.new("user://director_desk_selftest/runtime_%d/" % Time.get_ticks_usec())
	temp.v1_json_path = temp.root + "no_v1.json"
	boot_with(temp)
	if model == null:
		errors.append("boot should create 示例村庄")
		return errors
	if _tools == null or _hierarchy_box == null or _chapter_box == null or _scene_box == null or _inspector_title == null:
		errors.append("layout v3 regions missing")
	elif _hierarchy_box.get_child_count() < 3:
		errors.append("layout v3 hierarchy should list scene elements")
	if not _mode_btns.has(Mode.SCALE) or not _mode_btns.has(Mode.ROTATE):
		errors.append("scale/rotate canvas modes missing")
	elif (_mode_btns[Mode.SCALE] as Button).disabled or (_mode_btns[Mode.ROTATE] as Button).disabled:
		errors.append("scale/rotate canvas modes should be enabled with an open scene")
	if (_mode_btns[Mode.LASSO_WATER] as Button).text != "套索水域" or (_mode_btns[Mode.LASSO_REGION] as Button).text != "底图裁片":
		errors.append("water lasso and background region labels must be explicit")
	# Middle-button panning is an independent temporary gesture and must leave
	# an in-progress editor drag untouched.
	_drag = DragKind.BOX
	_canvas_panning = true
	var pan_before := village.camera.offset
	var pan_event := InputEventMouseMotion.new()
	pan_event.relative = Vector2(24.0, -12.0)
	_input(pan_event)
	if _drag != DragKind.BOX or village.camera.offset.distance_to(pan_before - pan_event.relative / village.camera.zoom.x) > 0.1:
		errors.append("middle-button pan interrupted active editor operation")
	_canvas_panning = false
	_drag = DragKind.NONE
	_select_resource_scope("default")
	_select_asset_category("backgrounds")
	if _asset_grid.get_child_count() != BUILTIN_BACKGROUNDS.size():
		errors.append("default background list should contain separate village and school cards")
	else:
		for tile in _asset_grid.get_children():
			var box: Node = null
			var preview_button: TextureButton = null
			if tile.get_child_count() > 0:
				box = tile.get_child(0)
			if box and box.get_child_count() > 0:
				preview_button = box.get_child(0) as TextureButton
			if preview_button == null or preview_button.texture_normal == null:
				errors.append("default background card missing thumbnail preview")
				break
	_select_asset_category("houses")
	_select_hierarchy("background", "")
	if selected_kind != "background" or _tab_pages[0].visible == false:
		errors.append("layout v3 background hierarchy selection failed")
	if not can_drop_asset(Vector2.ZERO, {"kind": "director_asset", "asset_id": "tree_oak"}):
		errors.append("canvas should accept library asset drag")
	for background in BUILTIN_BACKGROUNDS:
		_apply_builtin_background(background)
		if str(model.background.get("preset_id", "")) != str(background.get("preset_id", "")):
			errors.append("built-in background selection did not update preset")
		if village.terrain_size() != Vector2(1536, 1024) or not village.hide_baked_props:
			errors.append("built-in background image was not applied cleanly")
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
	selected_kind = "water"
	selected_water_id = "water_a"
	_rename_item_kind = "water"
	_rename_item_id = "water_a"
	_rename_item_edit.text = "村口小河"
	_confirm_item_rename()
	if str(_water_by_id("water_a").get("name", "")) != "村口小河":
		errors.append("Hierarchy element rename failed")
	var dir_a := water.material_flow_dir("water_a")
	var dir_b := water.material_flow_dir("water_b")
	if dir_a.dot(Vector2(0, 1)) < 0.9 or dir_b.dot(Vector2(1, 0)) < 0.9:
		errors.append("water materials not isolated at create")
	if water.material_current_strength("water_a") < 0.9 or water.material_current_strength("water_b") < 0.9:
		errors.append("water current streak layer should be visibly enabled")
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
	# Routine Inspector updates must not recenter the canvas or respawn actors.
	var preserved_actor_id := str(model.actors[0].get("id", "")) if not model.actors.is_empty() else ""
	var preserved_player := actors.player_for(preserved_actor_id)
	village.camera.offset = Vector2(137.0, -83.0)
	village.camera.zoom = Vector2(1.72, 1.72)
	if preserved_player:
		preserved_player.position += Vector2(31.0, 19.0)
	var preserved_actor_position := preserved_player.position if preserved_player else Vector2.ZERO
	model.editor["water_collision_enabled"] = false
	_sync_world()
	if village.camera.offset.distance_to(Vector2(137.0, -83.0)) > 0.1 or absf(village.camera.zoom.x - 1.72) > 0.001:
		errors.append("Inspector update recentered camera view")
	preserved_player = actors.player_for(preserved_actor_id)
	if preserved_player and preserved_player.position.distance_to(preserved_actor_position) > 0.1:
		errors.append("Inspector update reset actor position")
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
	# V2 layer rendering: higher integer wins; same-layer world positions retain Y order.
	_begin_cmd()
	model.elements.append({"id": "element_low", "asset_id": "tree_oak", "display_name": "树", "enabled": true, "position_uv": [0.35, 0.35], "layer": 2, "scale": 0.4, "rotation_degrees": 27.0})
	model.elements.append({"id": "element_high", "asset_id": "house_market", "display_name": "房屋", "enabled": true, "position_uv": [0.35, 0.65], "layer": 5, "scale": 0.4})
	model.elements.append({"id": "element_same_layer", "asset_id": "tree_pine", "display_name": "同层松树", "enabled": true, "position_uv": [0.45, 0.75], "layer": 2, "scale": 0.4})
	model.background_regions.append({"id": "region_test", "name": "平台", "enabled": true, "points_uv": [[0.55, 0.55], [0.72, 0.55], [0.68, 0.70]], "layer": 4})
	_end_cmd()
	_sync_world()
	if content.element_z_index("element_low") != 2 or content.element_z_index("element_high") != 5:
		errors.append("element integer layer not applied")
	if not is_equal_approx(content.element_rotation_degrees("element_low"), 27.0):
		errors.append("element rotation not applied")
	selected_element_id = "element_low"
	selected_kind = "element"
	var transform_corners := content.element_world_corners("element_low")
	if transform_corners.size() == 4:
		_set_mode(Mode.SCALE)
		var scale_handle := transform_corners[2]
		_begin_element_transform(scale_handle)
		var pivot := content.element_world_position("element_low")
		var scale_before := float(_element_by_id("element_low").get("scale", 0.0))
		_drag_scale_element(pivot + (scale_handle - pivot) * 1.5)
		if float(_element_by_id("element_low").get("scale", 0.0)) <= scale_before:
			errors.append("canvas scale drag did not enlarge element")
		_end_cmd()
		_drag = DragKind.NONE
		_sync_world()
		transform_corners = content.element_world_corners("element_low")
		_set_mode(Mode.ROTATE)
		pivot = content.element_world_position("element_low")
		var radius := 0.0
		for corner in transform_corners:
			radius = maxf(radius, pivot.distance_to(corner))
		var rotate_handle := pivot + Vector2.RIGHT * (radius + HANDLE * 2.0 / village.camera.zoom.x)
		_begin_element_transform(rotate_handle)
		var rotation_before := float(_element_by_id("element_low").get("rotation_degrees", 0.0))
		_drag_rotate_element((rotate_handle - pivot).rotated(PI * 0.25) + pivot)
		if absf(float(_element_by_id("element_low").get("rotation_degrees", 0.0)) - rotation_before) < 20.0:
			errors.append("canvas rotation drag did not rotate element")
		_end_cmd()
		_drag = DragKind.NONE
		_sync_world()
		_set_mode(Mode.SELECT)
	else:
		errors.append("element transform gizmo corners missing")
	if content.element_z_index("element_same_layer") != content.element_z_index("element_low") \
			or content.element_world_position("element_same_layer").y <= content.element_world_position("element_low").y \
			or not village.world.y_sort_enabled or not content.y_sort_enabled:
		errors.append("same-layer elements should use feet Y-sort")
	if content.region_z_index("region_test") != 4:
		errors.append("background region layer not applied")
	# Polygon water has individually draggable vertices.
	_begin_cmd()
	model.water_regions.append({"id": "water_poly", "name": "套索水域", "enabled": true, "shape": "polygon", "points_uv": [[0.60, 0.08], [0.78, 0.10], [0.76, 0.18], [0.58, 0.16]], "rect_uv": [0, 0, 0, 0], "flow_dir": [1, 0], "flow_speed": 0.35, "collision_enabled": true})
	_end_cmd()
	selected_water_id = "water_poly"
	selected_point = 1
	var old_vertex := DirectorSceneModel._vec2(model.water_regions.back().get("points_uv", [])[1], Vector2.ZERO)
	_drag_water_point(village.uv_to_world(Vector2(0.80, 0.12)))
	var new_vertex := DirectorSceneModel._vec2(model.water_regions.back().get("points_uv", [])[1], Vector2.ZERO)
	if new_vertex.distance_to(old_vertex) < 0.01:
		errors.append("polygon water control point did not move")
	_sync_world()
	# Two actors must move concurrently and honor independent speeds.
	model.actors[0]["route"]["speed_px_per_sec"] = 80.0
	var second_actor := _new_actor(CharacterRegistry.FARMER, Vector2(0.20, 0.80), [Vector2(0.70, 0.80)])
	second_actor["route"]["speed_px_per_sec"] = 320.0
	second_actor["layer"] = 3
	model.actors.append(second_actor)
	_sync_world()
	var first_actor_id := str(model.actors[0].get("id", ""))
	var second_actor_id := str(second_actor.get("id", ""))
	var first_player := actors.player_for(first_actor_id)
	var second_player := actors.player_for(second_actor_id)
	var first_start := first_player.position
	var second_start := second_player.position
	if not _try_play():
		errors.append("multi-actor play failed")
	else:
		for _i in 12:
			await village.get_tree().physics_frame
		var slow_distance := first_player.position.distance_to(first_start)
		var fast_distance := second_player.position.distance_to(second_start)
		if slow_distance < 1.0 or fast_distance <= slow_distance * 1.8:
			errors.append("actors did not honor independent speeds")
		_pause_preview()
		var first_paused := first_player.position
		var second_paused := second_player.position
		for _i in 5:
			await village.get_tree().physics_frame
		if first_player.position.distance_to(first_paused) > 1.0 or second_player.position.distance_to(second_paused) > 1.0:
			errors.append("multi-actor pause moved a role")
		_stop_preview(true)
	_begin_cmd()
	model.weather["enabled"] = true
	model.weather["type"] = "rain"
	model.weather["intensity"] = 0.9
	model.weather["time_of_day"] = "night"
	model.weather["moonlight_enabled"] = true
	model.weather["moonlight_intensity"] = 0.72
	model.weather["lightning_enabled"] = true
	model.weather["lightning_intensity"] = 0.82
	model.weather["lightning_frequency"] = 0.6
	model.weather["wind_enabled"] = true
	model.weather["wind_direction"] = [-1.0, 0.0]
	model.weather["wind_strength"] = 0.8
	model.rain_regions = [
		{"id": "rain_roof", "name": "屋顶", "enabled": true, "points_uv": [[0.10, 0.10], [0.32, 0.10], [0.30, 0.25], [0.12, 0.25]], "splashes_enabled": true, "layer": 30},
		{"id": "rain_tree", "name": "树冠", "enabled": true, "points_uv": [[0.55, 0.12], [0.72, 0.15], [0.68, 0.31], [0.52, 0.28]], "splashes_enabled": false, "layer": 31},
	]
	_end_cmd()
	var rain_roundtrip := DirectorSceneModel.from_dict(model.to_dict())
	if rain_roundtrip.rain_regions.size() != 2 \
			or not bool(rain_roundtrip.rain_regions[0].get("splashes_enabled", false)) \
			or bool(rain_roundtrip.rain_regions[1].get("splashes_enabled", true)):
		errors.append("rain regions did not survive scene round-trip")
	if not bool(rain_roundtrip.weather.get("lightning_enabled", false)) \
			or not bool(rain_roundtrip.weather.get("wind_enabled", false)) \
			or DirectorSceneModel._vec2(rain_roundtrip.weather.get("wind_direction", [0, 0]), Vector2.ZERO).dot(Vector2.LEFT) < 0.99:
		errors.append("lightning/wind settings did not survive scene round-trip")
	_apply_weather_effects()
	weather.set_director_time(0.0)
	if not weather.is_raining():
		errors.append("rain was not enabled")
	if not weather.has_visible_effect():
		errors.append("full-screen falling rain overlay was not shown")
	if absf(weather.applied_intensity() - 0.9) > 0.001:
		errors.append("rain intensity was not applied")
	if weather.applied_time_of_day() != "night" or absf(weather.applied_moonlight() - 0.72) > 0.001:
		errors.append("night moonlight was not applied")
	if absf(weather.material_moonlight() - 0.72) > 0.001:
		errors.append("moonlight slider did not reach day-cycle material")
	if not weather.has_wind_effect() or weather.applied_wind_direction().dot(Vector2.LEFT) < 0.99:
		errors.append("wind direction effect was not enabled")
	if absf(weather.applied_wind_strength() - 0.8) > 0.001 or absf(weather.rain_material_wind_strength() - 0.8) > 0.001:
		errors.append("wind strength did not bend the rain material")
	if not weather.rain_uses_endpoint_map():
		errors.append("rain regions did not reach the shared streak/splash endpoint map")
	if weather.lightning_flash_amount() < 0.75:
		errors.append("lightning double-flash envelope was not applied")
	var lightning_overlay := weather.get_node_or_null("LightningOverlay") as ColorRect
	if lightning_overlay == null or not lightning_overlay.visible:
		errors.append("lightning overlay was not visible during flash")
	var rain_overlay := weather.get_node_or_null("RainOverlay") as ColorRect
	if rain_overlay == null or not rain_overlay.visible or rain_overlay.size.x < 100.0 or rain_overlay.size.y < 100.0:
		errors.append("full-screen rain overlay did not cover viewport")
	if rain.get_child_count() != 2:
		errors.append("regional rain should create one clipped surface per configured area")
	if not rain.material_splashes_enabled("rain_roof") or rain.material_splashes_enabled("rain_tree"):
		errors.append("rain splash setting was not isolated per region")
	if absf(rain.material_intensity("rain_roof") - 0.9) > 0.001:
		errors.append("regional rain intensity was not applied")
	var day_overlay := weather.get_node_or_null("DayCycleOverlay") as ColorRect
	if day_overlay == null or not day_overlay.visible:
		errors.append("night colour grade was not visible")
	model.weather["enabled"] = false
	_apply_weather_effects()
	if weather.is_raining() or weather.has_visible_effect() or rain.get_child_count() != 0:
		errors.append("disabling rain should hide rain curtain and impact regions")
	model.weather["enabled"] = true
	_apply_weather_effects()
	if not weather.is_raining() or not weather.has_visible_effect() or rain.get_child_count() != 2:
		errors.append("re-enabling rain should restore curtain and impact regions")
	if DisplayServer.get_name() != "headless":
		# Capture wind on its own so visual regressions in strand length, width,
		# curvature, and curled tails are not hidden behind the rain curtain.
		model.weather["enabled"] = false
		model.weather["time_of_day"] = "noon"
		_apply_weather_effects()
		weather.set_director_time(1.35)
		await village._await_render()
		village._save_screenshot("director_desk_wind.png")
		weather.set_director_time(2.35)
		await village._await_render()
		village._save_screenshot("director_desk_wind_later.png")
		model.weather["enabled"] = true
		model.weather["time_of_day"] = "night"
		_apply_weather_effects()
		weather.set_director_time(1.35)
		rain.set_director_time(1.35)
		await village._await_render()
		village._save_screenshot("director_desk_rain.png")
		preview.director_time = 0.0
		weather.set_director_time(0.0)
		rain.set_director_time(0.0)
		await village._await_render()
		village._save_screenshot("director_desk_lightning.png")
	# undo 50
	var before := model.to_dict()
	var canonical_before := DirectorSceneModel.from_dict(before).to_dict()
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
	if JSON.stringify(canonical_before["water_regions"]) != JSON.stringify(after["water_regions"]):
		errors.append("undo did not restore water regions")
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
	content = SceneContentController.new()
	village.world.add_child(content)
	content.setup(village, asset_library)
	var rain_script := load("res://scripts/director/rain_region_controller.gd") as Script
	rain = rain_script.new()
	village.world.add_child(rain)
	rain.setup(village)
	weather = WeatherController.new()
	village.add_child(weather)
	weather.setup(village)
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
	var canvas_script := load("res://scripts/director/director_canvas_drop_target.gd") as Script
	_canvas_catch = canvas_script.new()
	_canvas_catch.desk = self
	_canvas_catch.color = Color(0, 0, 0, 0)
	_canvas_catch.mouse_filter = Control.MOUSE_FILTER_PASS
	_canvas_catch.gui_input.connect(_on_canvas_gui_input)
	_canvas_catch.z_index = 0
	add_child(_canvas_catch)
	_top = _chrome_panel()
	_left = _chrome_panel()
	_right = _chrome_panel()
	_bottom = _chrome_panel()
	_tools = _chrome_panel()
	_left.custom_minimum_size.x = LEFT_W
	_right.custom_minimum_size.x = RIGHT_W
	_top.z_index = 4
	_left.z_index = 4
	_right.z_index = 4
	_bottom.z_index = 4
	_tools.z_index = 4
	add_child(_top)
	add_child(_left)
	add_child(_right)
	add_child(_bottom)
	add_child(_tools)
	_fill_top()
	_fill_left()
	_fill_right()
	_fill_bottom()
	_fill_tools()
	_empty_label = _label("暂无场景，点击「新建场景」开始编排。", 16, true, true)
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
	row.add_theme_constant_override("separation", 6)
	_top.add_child(row)
	var title := _label("导演台 V3", 17, true)
	title.clip_text = false
	title.custom_minimum_size = Vector2(96, 0)
	row.add_child(title)
	var file_menu := MenuButton.new()
	file_menu.text = "文件"
	file_menu.get_popup().add_item("新建章节", 0)
	file_menu.get_popup().add_item("新建场景", 1)
	file_menu.get_popup().add_separator()
	file_menu.get_popup().add_item("新建角色", 2)
	file_menu.get_popup().add_item("新建矩形水域", 3)
	file_menu.get_popup().add_item("新建底图裁片区域", 4)
	file_menu.get_popup().add_item("新建降雨区域", 5)
	file_menu.get_popup().add_item("上传自定义资源", 6)
	file_menu.get_popup().add_separator()
	file_menu.get_popup().add_item("立即保存", 7)
	file_menu.get_popup().id_pressed.connect(_on_file_menu)
	row.add_child(file_menu)
	var edit_menu := MenuButton.new()
	edit_menu.text = "编辑"
	edit_menu.get_popup().add_item("撤销", 0)
	edit_menu.get_popup().add_item("重做", 1)
	edit_menu.get_popup().add_item("删除所选元素", 2)
	edit_menu.get_popup().id_pressed.connect(_on_edit_menu)
	row.add_child(edit_menu)
	_scene_name_label = _label("未选择场景", 15, false)
	_scene_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_scene_name_label)
	_mode_label = _label("编辑模式", 14, true)
	_mode_label.add_theme_color_override("font_color", Color(0.45, 1.0, 0.62))
	row.add_child(_mode_label)
	_play_btn = _btn("播放", func() -> void: _toggle_play())
	row.add_child(_play_btn)
	row.add_child(_btn("停止", func() -> void: _stop_preview(true)))
	_save_label = _label("已保存", 13, false)
	_save_label.clip_text = false
	_save_label.custom_minimum_size = Vector2(96, 0)
	row.add_child(_save_label)
	_drawer_scene_btn = _btn("场景", func() -> void: _toggle_drawer(true))
	_drawer_prop_btn = _btn("属性", func() -> void: _toggle_drawer(false))
	row.add_child(_drawer_scene_btn)
	row.add_child(_drawer_prop_btn)
	row.add_child(_btn("帮助", _show_help))


func _fill_left() -> void:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	_left.add_child(box)
	var hierarchy_header := HBoxContainer.new()
	hierarchy_header.add_child(_label("元素列表 / Hierarchy", 15, true))
	var hierarchy_add := MenuButton.new()
	hierarchy_add.text = "+"
	hierarchy_add.get_popup().add_item("角色", 0)
	hierarchy_add.get_popup().add_item("矩形水域", 1)
	hierarchy_add.get_popup().add_item("套索水域", 2)
	hierarchy_add.get_popup().add_item("底图裁片区域", 3)
	hierarchy_add.get_popup().add_item("降雨区域", 4)
	hierarchy_add.get_popup().id_pressed.connect(_on_hierarchy_add)
	hierarchy_header.add_child(hierarchy_add)
	_hierarchy_rename_btn = _btn("重命名", _open_selected_item_rename)
	_hierarchy_rename_btn.tooltip_text = "重命名选中的元素；也可双击元素名称"
	hierarchy_header.add_child(_hierarchy_rename_btn)
	box.add_child(hierarchy_header)
	var hierarchy_scroll := ScrollContainer.new()
	hierarchy_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hierarchy_scroll.custom_minimum_size = Vector2(0, 150)
	hierarchy_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(hierarchy_scroll)
	_hierarchy_box = VBoxContainer.new()
	_hierarchy_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hierarchy_scroll.add_child(_hierarchy_box)
	box.add_child(HSeparator.new())
	box.add_child(_label("资源列表", 15, true))
	var scope_row := HBoxContainer.new()
	_resource_scope_buttons.clear()
	for scope in ["default", "custom"]:
		var scope_id := str(scope)
		var scope_button := _btn("默认资源" if scope_id == "default" else "自定义资源", func() -> void: _select_resource_scope(scope_id))
		scope_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scope_row.add_child(scope_button)
		_resource_scope_buttons[scope_id] = scope_button
	box.add_child(scope_row)
	var category_row := HFlowContainer.new()
	_asset_category_buttons.clear()
	for item in [["backgrounds", "背景图"], ["trees", "树木"], ["characters", "角色"], ["houses", "房屋"]]:
		var category_id := str(item[0])
		var category_button := _btn(str(item[1]), func() -> void: _select_asset_category(category_id))
		category_row.add_child(category_button)
		_asset_category_buttons[category_id] = category_button
	box.add_child(category_row)
	_asset_drawer_button = _btn("上传到当前分类", _upload_custom_resource)
	box.add_child(_asset_drawer_button)
	var asset_scroll := ScrollContainer.new()
	asset_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	asset_scroll.custom_minimum_size = Vector2(0, 150)
	asset_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(asset_scroll)
	_asset_grid = GridContainer.new()
	_asset_grid.columns = 2
	_asset_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	asset_scroll.add_child(_asset_grid)
	_status_label = _label(" ", 13, false, true)
	_status_label.custom_minimum_size = Vector2(200, 42)
	box.add_child(_status_label)
	_select_asset_category("houses")


func _fill_right() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_right.add_child(col)
	_inspector_title = _label("属性 / Inspector", 15, true)
	col.add_child(_inspector_title)
	var names := ["场景", "水域", "角色", "天气"]
	_tab_btns.clear()
	_tab_pages.clear()
	_tabs = Control.new()
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tabs.custom_minimum_size = Vector2(0, 160)
	_tabs.clip_contents = true
	col.add_child(_tabs)
	for i in range(names.size()):
		var scroll := _make_scroll(names[i])
		scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		scroll.visible = i == 0
		_tabs.add_child(scroll)
		_tab_pages.append(scroll)
	_select_tab(0)


func _toggle_asset_drawer() -> void:
	_set_status("资源列表已固定在左下区域。")


func _select_asset_category(category: String) -> void:
	_asset_category = category
	_rebuild_asset_drawer()


func _select_resource_scope(scope: String) -> void:
	_resource_scope = scope
	_rebuild_asset_drawer()


func _rebuild_asset_drawer() -> void:
	if _asset_grid == null:
		return
	for child in _asset_grid.get_children():
		_asset_grid.remove_child(child)
		child.free()
	for category in _asset_category_buttons:
		var category_button: Button = _asset_category_buttons[category]
		category_button.modulate = Color(1.15, 0.95, 0.55) if category == _asset_category else Color.WHITE
	for scope in _resource_scope_buttons:
		var scope_button: Button = _resource_scope_buttons[scope]
		scope_button.modulate = Color(1.15, 0.95, 0.55) if scope == _resource_scope else Color.WHITE
	_asset_drawer_button.visible = _resource_scope == "custom"
	if _resource_scope == "custom":
		for custom in asset_library.list_assets(_asset_category):
			_add_resource_tile(custom, true)
		if _asset_grid.get_child_count() == 0:
			_asset_grid.add_child(_label("当前分类没有自定义资源。", 12, false, true))
		return
	if _asset_category == "backgrounds":
		for background in BUILTIN_BACKGROUNDS:
			_add_resource_tile(background, false)
		return
	if _asset_category == "characters":
		_add_resource_tile({"id": CharacterRegistry.FARMER, "name": "农夫", "category": "characters"}, false)
		_add_resource_tile({"id": CharacterRegistry.FARMER_BLUE, "name": "蓝衣农夫", "category": "characters"}, false)
		return
	var source_category := "trees" if _asset_category == "trees" else "houses"
	for asset in SceneContentController.assets_in_category(source_category):
		_add_resource_tile({"id": asset.get("id", ""), "name": asset.get("label", "资源"), "category": _asset_category}, false)


func _add_resource_tile(asset: Dictionary, custom: bool) -> void:
	var asset_id := str(asset.get("id", ""))
	var category := str(asset.get("category", _asset_category))
	if category == "backgrounds":
		_add_background_resource_tile(asset, custom)
		return
	var tile := _btn(str(asset.get("name", asset_id)), func() -> void: _activate_resource(asset_id, category, custom), 48)
	tile.tooltip_text = "点击使用此资源"
	tile.custom_minimum_size.x = 106
	var path := asset_library.texture_path(asset_id) if custom else "res://art/sliced/%s.png" % asset_id
	if custom and not path.is_empty():
		var image := Image.new()
		if image.load_png_from_buffer(FileAccess.get_file_as_bytes(path)) == OK:
			tile.icon = ImageTexture.create_from_image(image)
	elif ResourceLoader.exists(path):
		tile.icon = load(path)
	tile.expand_icon = true
	tile.add_theme_constant_override("icon_max_width", 48)
	_asset_grid.add_child(tile)


func _add_background_resource_tile(asset: Dictionary, custom: bool) -> void:
	var asset_id := str(asset.get("id", ""))
	var display_name := str(asset.get("name", asset_id))
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(106, 104)
	panel.tooltip_text = "点击预览图，将场景背景替换为%s" % display_name
	var content_box := VBoxContainer.new()
	content_box.add_theme_constant_override("separation", 4)
	panel.add_child(content_box)
	var preview := TextureButton.new()
	preview.custom_minimum_size = Vector2(100, 72)
	preview.ignore_texture_size = true
	preview.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	preview.tooltip_text = panel.tooltip_text
	var path := asset_library.texture_path(asset_id) if custom else str(asset.get("path", ""))
	if custom and not path.is_empty():
		var image := Image.new()
		if image.load_png_from_buffer(FileAccess.get_file_as_bytes(path)) == OK:
			preview.texture_normal = ImageTexture.create_from_image(image)
	elif ResourceLoader.exists(path):
		preview.texture_normal = load(path) as Texture2D
	preview.pressed.connect(func() -> void: _activate_resource(asset_id, "backgrounds", custom))
	content_box.add_child(preview)
	var title := _label(display_name, 12, true)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title.tooltip_text = panel.tooltip_text
	content_box.add_child(title)
	_asset_grid.add_child(panel)


func _select_tab(index: int) -> void:
	_tab_index = index
	for i in range(_tab_pages.size()):
		_tab_pages[i].visible = i == index
		if i < _tab_btns.size():
			_tab_btns[i].modulate = Color(1.15, 0.95, 0.55) if i == index else Color.WHITE
	_refresh_inspector()


func _fill_bottom() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	_bottom.add_child(col)
	var header := HBoxContainer.new()
	header.add_child(_label("Project · 章节 / 场景", 15, true))
	header.add_child(_btn("新建章节", _open_new_chapter_dialog))
	header.add_child(_btn("新建场景", _open_new_dialog))
	_search_edit = LineEdit.new()
	_search_edit.placeholder_text = "搜索场景"
	_search_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_search_edit.text_changed.connect(func(text: String) -> void: _search_query = text; _refresh_scene_list())
	header.add_child(_search_edit)
	_loop_box = _checkbox("循环预览", false, func(v: bool) -> void: preview.loop_preview = v)
	header.add_child(_loop_box)
	_transport_label = _label("已停止", 13, false)
	header.add_child(_transport_label)
	col.add_child(header)
	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	col.add_child(body)
	var chapter_scroll := ScrollContainer.new()
	chapter_scroll.custom_minimum_size.x = 230
	chapter_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(chapter_scroll)
	_chapter_box = VBoxContainer.new()
	_chapter_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chapter_scroll.add_child(_chapter_box)
	var scene_scroll := ScrollContainer.new()
	scene_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scene_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scene_scroll)
	_scene_box = HFlowContainer.new()
	_scene_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scene_scroll.add_child(_scene_box)


func _fill_tools() -> void:
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_tools.add_child(col)
	col.add_child(_label("工具", 13, true))
	_mode_btns[Mode.SELECT] = _btn("移动 V", func() -> void: _set_mode(Mode.SELECT), 38)
	_mode_btns[Mode.SCALE] = _btn("缩放", func() -> void: _set_mode(Mode.SCALE), 38)
	_mode_btns[Mode.ROTATE] = _btn("旋转", func() -> void: _set_mode(Mode.ROTATE), 38)
	_mode_btns[Mode.BOX_WATER] = _btn("矩形水域", func() -> void: _set_mode(Mode.BOX_WATER), 38)
	_mode_btns[Mode.LASSO_WATER] = _btn("套索水域", func() -> void: _set_mode(Mode.LASSO_WATER), 38)
	_mode_btns[Mode.LASSO_REGION] = _btn("底图裁片", func() -> void: _set_mode(Mode.LASSO_REGION), 38)
	_mode_btns[Mode.LASSO_RAIN] = _btn("降雨区域", func() -> void: _start_rain_lasso(true), 38)
	_mode_btns[Mode.EDIT_ROUTE] = _btn("路线", func() -> void: _set_mode(Mode.EDIT_ROUTE), 38)
	(_mode_btns[Mode.SELECT] as Button).tooltip_text = "V：点选并拖动；方向键微调，Shift+方向键移动 10 像素"
	(_mode_btns[Mode.SCALE] as Button).tooltip_text = "Ctrl/Cmd+T：选中图片元素后拖动四角控制点等比缩放"
	(_mode_btns[Mode.ROTATE] as Button).tooltip_text = "选中图片元素后拖动外圈旋转；Shift 吸附 15°"
	(_mode_btns[Mode.BOX_WATER] as Button).tooltip_text = "拖出矩形水域"
	(_mode_btns[Mode.LASSO_WATER] as Button).tooltip_text = "逐点圈出不规则水域"
	(_mode_btns[Mode.LASSO_REGION] as Button).tooltip_text = "逐点圈出可单独设置层级的背景区域，不会创建水域"
	(_mode_btns[Mode.LASSO_RAIN] as Button).tooltip_text = "逐点圈出屋顶、树木或地面的雨滴终点；不会限制全屏雨幕"
	for child in _mode_btns.values():
		col.add_child(child)
	col.add_child(_btn("镜像", _toggle_selected_flip, 38))


func _make_scroll(title: String) -> ScrollContainer:
	var scroll := ScrollContainer.new()
	scroll.name = title
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var inner := VBoxContainer.new()
	inner.name = "Inner"
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.custom_minimum_size = Vector2(260, 0)
	scroll.add_child(inner)
	return scroll


func _build_dialogs() -> void:
	_help = AcceptDialog.new()
	_help.title = "帮助"
	_help.dialog_text = HELP_TEXT
	_help.ok_button_text = "关闭"
	_help.min_size = Vector2(520, 360)
	add_child(_help)
	_new_dialog = ConfirmationDialog.new()
	_new_dialog.title = "新建场景"
	_new_dialog.ok_button_text = "创建"
	_new_dialog.cancel_button_text = "取消"
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
	_rename_dialog.ok_button_text = "确定"
	_rename_dialog.cancel_button_text = "取消"
	_rename_edit = LineEdit.new()
	_rename_dialog.add_child(_rename_edit)
	_rename_dialog.confirmed.connect(_confirm_rename)
	add_child(_rename_dialog)
	_delete_dialog = ConfirmationDialog.new()
	_delete_dialog.title = "删除场景"
	_delete_dialog.ok_button_text = "删除"
	_delete_dialog.cancel_button_text = "取消"
	_delete_dialog.confirmed.connect(_confirm_delete)
	add_child(_delete_dialog)
	_conflict_dialog = ConfirmationDialog.new()
	_conflict_dialog.title = "未保存的问题"
	_conflict_dialog.ok_button_text = "放弃未保存修改"
	_conflict_dialog.cancel_button_text = "修正问题"
	_conflict_dialog.confirmed.connect(_abandon_and_open)
	add_child(_conflict_dialog)
	_new_chapter_dialog = ConfirmationDialog.new()
	_new_chapter_dialog.title = "新建章节"
	_new_chapter_dialog.ok_button_text = "创建"
	_new_chapter_dialog.cancel_button_text = "取消"
	_new_chapter_name = LineEdit.new()
	_new_chapter_name.placeholder_text = "章节名称"
	_new_chapter_dialog.add_child(_new_chapter_name)
	_new_chapter_dialog.confirmed.connect(_confirm_new_chapter)
	add_child(_new_chapter_dialog)
	_rename_chapter_dialog = ConfirmationDialog.new()
	_rename_chapter_dialog.title = "重命名章节"
	_rename_chapter_dialog.ok_button_text = "确定"
	_rename_chapter_dialog.cancel_button_text = "取消"
	_rename_chapter_edit = LineEdit.new()
	_rename_chapter_dialog.add_child(_rename_chapter_edit)
	_rename_chapter_dialog.confirmed.connect(_confirm_rename_chapter)
	add_child(_rename_chapter_dialog)
	_delete_chapter_dialog = ConfirmationDialog.new()
	_delete_chapter_dialog.title = "删除章节"
	_delete_chapter_dialog.ok_button_text = "删除章节及其场景"
	_delete_chapter_dialog.cancel_button_text = "取消"
	_delete_chapter_dialog.confirmed.connect(_confirm_delete_chapter)
	add_child(_delete_chapter_dialog)
	_replace_background_dialog = ConfirmationDialog.new()
	_replace_background_dialog.title = "替换背景"
	_replace_background_dialog.dialog_text = "当前场景已有背景图，是否替换？"
	_replace_background_dialog.ok_button_text = "替换"
	_replace_background_dialog.cancel_button_text = "取消"
	_replace_background_dialog.confirmed.connect(_confirm_background_replace)
	add_child(_replace_background_dialog)
	_rename_item_dialog = ConfirmationDialog.new()
	_rename_item_dialog.title = "重命名元素"
	_rename_item_dialog.ok_button_text = "确定"
	_rename_item_dialog.cancel_button_text = "取消"
	_rename_item_edit = LineEdit.new()
	_rename_item_edit.max_length = DirectorSceneModel.NAME_MAX
	_rename_item_dialog.add_child(_rename_item_edit)
	_rename_item_dialog.confirmed.connect(_confirm_item_rename)
	add_child(_rename_item_dialog)


func _on_file_menu(id: int) -> void:
	match id:
		0: _open_new_chapter_dialog()
		1: _open_new_dialog()
		2: _add_actor_clicked()
		3: _set_mode(Mode.BOX_WATER)
		4: _set_mode(Mode.LASSO_REGION)
		5: _start_rain_lasso(true)
		6: _upload_custom_resource()
		7: _flush_save()


func _on_edit_menu(id: int) -> void:
	match id:
		0: _undo()
		1: _redo()
		2: _delete_selected()


func _on_hierarchy_add(id: int) -> void:
	match id:
		0: _add_actor_clicked()
		1: _set_mode(Mode.BOX_WATER)
		2: _set_mode(Mode.LASSO_WATER)
		3: _set_mode(Mode.LASSO_REGION)
		4: _start_rain_lasso(true)


func _activate_resource(asset_id: String, category: String, custom: bool) -> void:
	if model == null:
		_set_status("请先打开或新建场景。")
		return
	if category == "backgrounds":
		_request_background_replace(("custom:" + asset_id) if custom else asset_id)
		return
	if category == "characters" and not custom:
		_add_actor_resource(asset_id)
		return
	_choose_asset_for_canvas(asset_id)
	if custom and category == "characters":
		_set_status("自定义角色图片将先作为静态元素放置；序列帧路线在后续版本开放。")


func _add_actor_resource(character_id: String) -> void:
	if model == null:
		return
	_begin_cmd()
	var offset := Vector2(0.04 * (model.actors.size() % 5), 0.04 * (model.actors.size() % 3))
	var actor := _new_actor(character_id, (Vector2(0.42, 0.42) + offset).clamp(Vector2.ZERO, Vector2.ONE), [])
	model.actors.append(actor)
	_end_cmd()
	_select_hierarchy("actor", str(actor.get("id", "")))
	_sync_world()
	_set_status("已添加角色；可在属性面板添加和编辑路线。")


func _upload_custom_resource() -> void:
	_resource_scope = "custom"
	_pick_reason = "custom_asset:" + _asset_category
	_picker.pick()


func _request_background_replace(action: String) -> void:
	if model == null:
		_set_status("请先打开或新建场景。")
		return
	_pending_background_action = action
	_replace_background_dialog.popup_centered()


func _confirm_background_replace() -> void:
	var action := _pending_background_action
	_pending_background_action = ""
	var builtin := _builtin_background_by_id(action)
	if not builtin.is_empty():
		_apply_builtin_background(builtin)
	elif action.begins_with("custom:"):
		_apply_custom_background(action.trim_prefix("custom:"))
	_refresh_hierarchy()
	_refresh_inspector()


func _builtin_background_by_id(asset_id: String) -> Dictionary:
	for background in BUILTIN_BACKGROUNDS:
		if str(background.get("id", "")) == asset_id:
			return background
	return {}


func _builtin_background_by_preset(preset_id: String) -> Dictionary:
	for background in BUILTIN_BACKGROUNDS:
		if str(background.get("preset_id", "")) == preset_id:
			return background
	return {}


func _apply_builtin_background(background: Dictionary) -> void:
	var path := str(background.get("path", ""))
	var texture: Texture2D = null
	if ResourceLoader.exists(path):
		texture = load(path) as Texture2D
	if texture == null:
		_set_status("找不到默认背景资源。")
		return
	var size := texture.get_size()
	_begin_cmd()
	model.background = {
		"source": "preset",
		"preset_id": str(background.get("preset_id", DirectorSceneModel.PRESET_VILLAGE)),
		"file": null,
		"pixel_size": [int(size.x), int(size.y)],
	}
	# 两张新背景已经包含建筑，不能再叠加旧村庄的内置道具。
	model.editor["show_baked_props"] = false
	_end_cmd()
	_sync_world()
	_set_status("已替换为%s。" % str(background.get("name", "默认背景")))


func _apply_custom_background(asset_id: String) -> void:
	var source := asset_library.texture_path(asset_id)
	if source.is_empty() or not FileAccess.file_exists(source):
		_set_status("找不到自定义背景资源。")
		return
	var image := Image.new()
	if image.load_png_from_buffer(FileAccess.get_file_as_bytes(source)) != OK:
		_set_status("无法解码自定义背景。")
		return
	var target := repo.resolve_scene_file(model.scene_id, "background.png")
	if target.is_empty() or image.save_png(target) != OK:
		_set_status("无法保存场景背景。")
		return
	var info := asset_library.info(asset_id)
	_begin_cmd()
	model.background = {"source": "uploaded", "preset_id": null, "file": "background.png", "original_file_name": str(info.get("name", "自定义背景")), "pixel_size": [image.get_width(), image.get_height()]}
	model.editor["show_baked_props"] = false
	_end_cmd()
	_sync_world()


func _toggle_selected_flip() -> void:
	var element := _element_by_id(selected_element_id)
	if element.is_empty():
		_set_status("请先选择树木、房屋或图片元素。")
		return
	_begin_cmd()
	element["flip_h"] = not bool(element.get("flip_h", false))
	_end_cmd()
	_sync_world()
	_refresh_inspector()


func _delete_selected() -> void:
	if model == null:
		return
	match selected_kind:
		"element": _delete_selected_element()
		"background_region": _delete_selected_region()
		"rain": _delete_selected_rain()
		"water":
			_begin_cmd(); _remove_water(selected_water_id); _end_cmd(); _select_hierarchy("background", ""); _sync_world()
		"actor":
			_begin_cmd()
			for i in range(model.actors.size() - 1, -1, -1):
				if str(model.actors[i].get("id", "")) == selected_actor_id: model.actors.remove_at(i)
			_end_cmd(); _select_hierarchy("background", ""); _sync_world()
		_: _set_status("当前元素不能删除。")


func _process(delta: float) -> void:
	var vp := get_viewport_rect().size
	if vp != _last_layout_size:
		_apply_layout()
	if _drag == DragKind.BOX and village:
		_box_b = village.get_global_mouse_position()
		_box_b_screen = _screen_mouse()
	if village and village.player:
		village.player.control_enabled = not _shortcuts_blocked()
	preview.tick(delta, preview.is_paused())
	if water:
		water.set_director_time(preview.director_time)
	if weather:
		weather.set_paused(preview.is_paused())
		weather.set_director_time(preview.director_time)
	if rain:
		rain.set_director_time(preview.director_time)
	if _transport_label:
		_transport_label.text = preview.status_text()
	if _play_btn:
		_play_btn.text = "暂停" if preview.is_playing() else "播放"
	if _mode_label:
		if preview.is_playing() or preview.is_paused() or mode == Mode.PREVIEW:
			_mode_label.text = "播放模式"
			_mode_label.add_theme_color_override("font_color", Color(1.0, 0.72, 0.3))
		else:
			_mode_label.text = "编辑模式"
			_mode_label.add_theme_color_override("font_color", Color(0.45, 1.0, 0.62))
	if preview.is_playing() and _play_had_actor and not actors.any_playing():
		_play_had_actor = false
		_on_ensemble_ended()


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_button := event as InputEventMouseButton
		if mouse_button.button_index == MOUSE_BUTTON_MIDDLE:
			if mouse_button.pressed:
				_canvas_panning = not _shortcuts_blocked() and _pointer_over_canvas(mouse_button.position)
			elif _canvas_panning:
				_canvas_panning = false
			if _canvas_panning or not mouse_button.pressed:
				get_viewport().set_input_as_handled()
			return
		if mouse_button.pressed and mouse_button.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN] \
				and not _shortcuts_blocked() and _pointer_over_canvas(mouse_button.position):
			var amount: float = village.camera.zoom_step if mouse_button.button_index == MOUSE_BUTTON_WHEEL_UP else -village.camera.zoom_step
			village.camera.zoom_at_screen_position(amount, mouse_button.position)
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseMotion and _canvas_panning:
		var motion := event as InputEventMouseMotion
		village.camera.offset -= motion.relative / maxf(village.camera.zoom.x, 0.001)
		get_viewport().set_input_as_handled()
		return
	if _drag == DragKind.NONE:
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_on_left_mouse(event)
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		_on_mouse_move(event)
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		var key_event := event as InputEventKey
		if key_event.physical_keycode == KEY_ESCAPE:
			_on_escape()
			get_viewport().set_input_as_handled()


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
		if cmd and key == KEY_T:
			_set_mode(Mode.SCALE)
			get_viewport().set_input_as_handled()
			return
		if not cmd and key == KEY_V:
			_set_mode(Mode.SELECT)
			get_viewport().set_input_as_handled()
			return
		if key in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN] and selected_kind == "element":
			_nudge_selected_element(key, 10 if key_event.shift_pressed else 1)
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
		if key == KEY_ENTER and mode in [Mode.LASSO_WATER, Mode.LASSO_REGION, Mode.LASSO_RAIN]:
			_finish_lasso()
			get_viewport().set_input_as_handled()
			return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_on_left_mouse(event)
		return
	if event is InputEventMouseMotion:
		_on_mouse_move(event)


func _on_canvas_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_on_left_mouse(event)
		accept_event()
	elif event is InputEventMouseMotion:
		_on_mouse_move(event)
		if _drag != DragKind.NONE:
			accept_event()


func _on_left_mouse(event: InputEventMouseButton) -> void:
	if model == null or _preview_locked_edits():
		if not event.pressed:
			_drag = DragKind.NONE
			_update_catcher()
		if event.pressed and _preview_locked_edits():
			_set_status("预览中不能编辑水域或路线。")
		return
	var world := _event_world(event)
	var screen := _event_screen(event)
	if event.pressed:
		if _placing_asset:
			_place_asset_at(_asset_choice, village.world_to_uv(world))
			get_viewport().set_input_as_handled()
			return
		if mode == Mode.SCALE or mode == Mode.ROTATE:
			_begin_element_transform(world)
			get_viewport().set_input_as_handled()
			return
		if mode == Mode.BOX_WATER:
			if _drag == DragKind.BOX:
				_box_b = world
				_box_b_screen = screen
				_try_commit_box()
			else:
				_drag = DragKind.BOX
				_box_a = world
				_box_b = world
				_box_a_screen = screen
				_box_b_screen = screen
				_update_catcher()
				_set_status("框选水域：拖出矩形，或在对角再点一次结束。")
			get_viewport().set_input_as_handled()
			return
		if mode in [Mode.LASSO_WATER, Mode.LASSO_REGION, Mode.LASSO_RAIN]:
			_click_lasso(world, event.double_click)
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
			_box_b = world
			_box_b_screen = screen
			_try_commit_box()
		elif _drag != DragKind.NONE:
			_end_cmd()
			_sync_world()
			_drag = DragKind.NONE
			_update_catcher()
		get_viewport().set_input_as_handled()


func _on_mouse_move(_event: InputEventMouseMotion) -> void:
	if model == null or _preview_locked_edits():
		return
	var world := village.get_global_mouse_position()
	if _drag == DragKind.BOX:
		_box_b = world
		_box_b_screen = _screen_mouse()
	elif _drag == DragKind.WATER_MOVE:
		_drag_move_water(world)
	elif _drag == DragKind.WATER_RESIZE:
		_drag_resize_water(world)
	elif _drag == DragKind.WATER_DIR:
		_drag_water_dir(world)
	elif _drag == DragKind.WATER_POINT:
		_drag_water_point(world)
	elif _drag == DragKind.RAIN_POINT:
		_drag_rain_point(world)
	elif _drag == DragKind.ROUTE_POINT:
		_drag_route_point(world)
	elif _drag == DragKind.ELEMENT_MOVE:
		_drag_move_element(world)
	elif _drag == DragKind.ELEMENT_SCALE:
		_drag_scale_element(world)
	elif _drag == DragKind.ELEMENT_ROTATE:
		_drag_rotate_element(world)


func _click_select(world: Vector2) -> void:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var hit_actor_id := actors.hit_actor(world, zoom)
	if not hit_actor_id.is_empty():
		selected_kind = "actor"
		selected_actor_id = hit_actor_id
		selected_point = -1
		selected_water_id = ""
		selected_element_id = ""
		selected_region_id = ""
		selected_rain_id = ""
		_begin_cmd()
		_drag = DragKind.ROUTE_POINT
		var hit_player := actors.player_for(hit_actor_id)
		_drag_world_offset = hit_player.position - world if hit_player else Vector2.ZERO
		_select_tab(2)
		_refresh_inspector()
		_refresh_hierarchy()
		return
	var selected_actor := actors.actor_by_id(model, selected_actor_id)
	if not selected_actor.is_empty():
		var idx := _hit_route_index(world, selected_actor)
		if idx >= 0:
			selected_point = idx
			_begin_cmd()
			_drag = DragKind.ROUTE_POINT
			return
	var element_id := content.hit_element(world)
	if not element_id.is_empty():
		selected_kind = "element"
		selected_element_id = element_id
		selected_actor_id = ""
		selected_water_id = ""
		selected_region_id = ""
		selected_rain_id = ""
		_begin_cmd()
		_drag = DragKind.ELEMENT_MOVE
		_drag_world_offset = content.element_world_position(element_id) - world
		_select_tab(0)
		_refresh_inspector()
		_refresh_hierarchy()
		return
	var rid := water.hit_region(world, model)
	if not rid.is_empty():
		selected_kind = "water"
		selected_water_id = rid
		selected_actor_id = ""
		selected_element_id = ""
		selected_region_id = ""
		selected_rain_id = ""
		selected_point = -2
		_select_tab(1)
		var region := _water_by_id(rid)
		var rect := water.world_rect_of(region)
		_begin_cmd()
		var vertex := _hit_water_vertex(region, world)
		if vertex >= 0:
			_drag = DragKind.WATER_POINT
			selected_point = vertex
		elif _near(world, _arrow_tip(region, rect)):
			_drag = DragKind.WATER_DIR
		else:
			var corner := _hit_corner(rect, world)
			if corner >= 0:
				_drag = DragKind.WATER_RESIZE
				_drag_corner = corner
			else:
				_drag = DragKind.WATER_MOVE
				_drag_world_offset = rect.position + rect.size * 0.5 - world
		_refresh_inspector()
		_refresh_hierarchy()
		return
	var rain_id: String = rain.hit_region(world, model)
	if not rain_id.is_empty():
		selected_kind = "rain"
		selected_rain_id = rain_id
		selected_water_id = ""
		selected_actor_id = ""
		selected_element_id = ""
		selected_region_id = ""
		_select_tab(3)
		var vertex := _hit_rain_vertex(_rain_by_id(rain_id), world)
		if vertex >= 0:
			selected_point = vertex
			_begin_cmd()
			_drag = DragKind.RAIN_POINT
		_refresh_inspector()
		_refresh_hierarchy()
		return
	var region_id := content.hit_background_region(world)
	if not region_id.is_empty():
		selected_kind = "background_region"
		selected_region_id = region_id
		selected_water_id = ""
		selected_actor_id = ""
		selected_element_id = ""
		selected_rain_id = ""
		_select_tab(0)
		_refresh_inspector()
		_refresh_hierarchy()
		return
	selected_water_id = ""
	selected_actor_id = ""
	selected_element_id = ""
	selected_region_id = ""
	selected_rain_id = ""
	selected_point = -2
	selected_kind = "background"
	_refresh_inspector()
	_refresh_hierarchy()


func _click_route(world: Vector2) -> void:
	var hit_actor_id := actors.hit_actor(world, village.camera.zoom.x if village.camera else 1.0)
	if not hit_actor_id.is_empty() and hit_actor_id != selected_actor_id:
		selected_kind = "actor"
		selected_actor_id = hit_actor_id
		selected_point = -2
		_refresh_inspector()
		_refresh_hierarchy()
		_set_status("已选择角色；现在可编辑这名角色的路线。")
		return
	var actor := actors.actor_by_id(model, selected_actor_id)
	if actor.is_empty():
		_set_status("请先在画布或角色列表点选一名角色。")
		return
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


func _try_commit_box() -> void:
	var screen_rect := _normalized_world_rect(_box_a_screen, _box_b_screen)
	if screen_rect.size.x < 8.0 or screen_rect.size.y < 8.0:
		_set_status("继续拖动，或在对角再点一次结束框选。")
		return
	_finish_box()


func _finish_box() -> void:
	var screen_rect := _normalized_world_rect(_box_a_screen, _box_b_screen)
	if screen_rect.size.x < 8.0 or screen_rect.size.y < 8.0:
		_set_status("继续拖动，或在对角再点一次结束框选。")
		return
	var rect := _normalized_world_rect(_box_a, _box_b)
	var uv := _world_to_uv_rect(rect)
	var px := village.terrain_size()
	if uv.size.x * px.x < 8.0 or uv.size.y * px.y < 8.0:
		_set_status("水域矩形过小（至少 8×8 像素），请拉大再结束。")
		return
	_drag = DragKind.NONE
	_update_catcher()
	_begin_cmd()
	var id := DirectorSceneModel.new_hex_id("water_", 4)
	_add_water(uv, Vector2(0, 1), id)
	selected_water_id = id
	selected_kind = "water"
	_end_cmd()
	_sync_world()
	_select_tab(1)
	_refresh_inspector()
	_refresh_hierarchy()
	if model.has_water_overlap():
		_set_status("水域不能重叠")
	else:
		_set_status("已创建水域。")


func _click_lasso(world: Vector2, double_click: bool) -> void:
	var uv := _maybe_snap_uv(village.world_to_uv(world))
	if _lasso_points.size() >= 3 and (double_click or uv.distance_to(_lasso_points[0]) * village.terrain_size().length() < 14.0):
		_finish_lasso()
		return
	_lasso_points.append(uv)
	_set_status("套索已有 %d 个点；双击、点回起点或按 Enter 闭合。" % _lasso_points.size())


func _finish_lasso() -> void:
	if _lasso_points.size() < 3:
		_set_status("套索至少需要 3 个点。")
		return
	if DirectorSceneModel.polygon_area(_lasso_points) <= DirectorSceneModel.UV_EPS:
		_set_status("套索区域太小。")
		return
	var points: Array = []
	for point in _lasso_points:
		points.append(DirectorSceneModel.vec2_to_arr(point))
	_begin_cmd()
	if mode == Mode.LASSO_WATER:
		var water_id := DirectorSceneModel.new_hex_id("water_", 4)
		model.water_regions.append({
			"id": water_id, "name": "套索水域 %d" % (model.water_regions.size() + 1), "enabled": true, "shape": "polygon",
			"points_uv": points, "rect_uv": [0, 0, 0, 0], "flow_dir": [0, 1],
			"flow_speed": 0.22, "collision_enabled": true, "layer": -15,
		})
		selected_water_id = water_id
		selected_kind = "water"
		selected_region_id = ""
		selected_rain_id = ""
		_select_tab(1)
	elif mode == Mode.LASSO_REGION:
		var region_id := DirectorSceneModel.new_hex_id("region_", 4)
		model.background_regions.append({
			"id": region_id, "name": "底图区域 %d" % (model.background_regions.size() + 1), "enabled": true, "points_uv": points, "layer": 1,
		})
		selected_region_id = region_id
		selected_kind = "background_region"
		selected_water_id = ""
		selected_rain_id = ""
		_select_tab(0)
	else:
		var rain_id := DirectorSceneModel.new_hex_id("rain_", 4)
		model.rain_regions.append({
			"id": rain_id, "name": "降雨区域 %d" % (model.rain_regions.size() + 1), "enabled": true,
			"points_uv": points, "splashes_enabled": _new_rain_splashes, "layer": 30,
		})
		selected_rain_id = rain_id
		selected_kind = "rain"
		selected_water_id = ""
		selected_region_id = ""
		_select_tab(3)
	_lasso_points = PackedVector2Array()
	_end_cmd()
	_sync_world()
	_refresh_inspector()
	_refresh_hierarchy()
	_refresh_mode_buttons()
	if model.has_water_overlap():
		_set_status("水域不能重叠")
	elif mode == Mode.LASSO_WATER:
		_set_status("已创建套索水域；工具保持激活，可继续创建，按 Esc 返回移动。")
	elif mode == Mode.LASSO_RAIN:
		_set_status("已创建降雨区域（%s水花）；工具保持激活，可继续圈选。" % ("有" if _new_rain_splashes else "无"))
	else:
		_set_status("已创建底图裁片；工具保持激活，可继续创建，按 Esc 返回移动。")


func _apply_loaded_model(loaded: DirectorSceneModel) -> void:
	_loading = true
	model = loaded
	undo.clear()
	_dirty = false
	selected_water_id = ""
	selected_actor_id = ""
	selected_element_id = ""
	selected_region_id = ""
	selected_rain_id = ""
	selected_kind = "background"
	_lasso_points = PackedVector2Array()
	selected_point = -2
	preview.state = PreviewController.State.STOPPED
	preview.entered_preview = false
	actors.stop_all("replace")
	_sync_world(true)
	_loading = false
	_set_save_status("saved")
	_refresh_all()
	if loaded.legacy_water != null:
		_set_status("旧版水域：请重新框选")
	var actor := actors.first_actor(model)
	if not actor.is_empty() and not CharacterRegistry.is_known(str(actor.get("character_id", ""))):
		_set_status("找不到角色，已显示默认占位")


func _sync_world(reset_editor_view: bool = false) -> void:
	if model == null:
		village.hide_legacy_water()
		water.rebuild(null)
		weather.apply(null)
		rain.rebuild(null)
		content.rebuild(null)
		actors.clear(village)
		_empty_label.visible = true
		return
	_empty_label.visible = false
	var camera_offset := village.camera.offset if village.camera else Vector2.ZERO
	var camera_zoom := village.camera.zoom if village.camera else Vector2.ONE
	_apply_background()
	content.rebuild(model)
	water.rebuild(model)
	rain.rebuild(model)
	_apply_legacy()
	actors.rebuild(village, model, reset_editor_view)
	if village.camera and not reset_editor_view:
		village.camera.offset = camera_offset
		village.camera.zoom = camera_zoom
	weather.apply(model)
	_refresh_mode_buttons()


func _apply_background() -> void:
	var source := str(model.background.get("source", "preset"))
	var show_props := bool(model.editor.get("show_baked_props", source == "preset"))
	if source == "preset":
		var preset := _builtin_background_by_preset(str(model.background.get("preset_id", "")))
		if not preset.is_empty():
			var path := str(preset.get("path", ""))
			var texture: Texture2D = null
			if ResourceLoader.exists(path):
				texture = load(path) as Texture2D
			if texture:
				village.apply_director_image(texture.get_image(), true)
				return
			_set_status("找不到默认背景文件，已使用旧版村庄。")
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
	selected_kind = ""
	undo.clear()
	village.hide_legacy_water()
	water.rebuild(null)
	content.rebuild(null)
	actors.clear(village)
	weather.apply(null)
	rain.rebuild(null)
	_empty_label.visible = true
	_scene_name_label.text = "未选择场景"
	_refresh_all()


func _refresh_all() -> void:
	_refresh_scene_list()
	_refresh_hierarchy()
	_refresh_inspector()
	_refresh_mode_buttons()
	if model:
		_scene_name_label.text = model.name
	_play_btn.disabled = model == null or model.has_water_overlap()


func _refresh_scene_list() -> void:
	if _scene_box == null or _chapter_box == null or repo == null:
		return
	for child in _scene_box.get_children():
		_scene_box.remove_child(child)
		child.free()
	for child in _chapter_box.get_children():
		_chapter_box.remove_child(child)
		child.free()
	if model == null:
		_scene_name_label.text = "未选择场景"
	for chapter in repo.list_chapters():
		var cid := str(chapter.get("id", ""))
		_chapter_box.add_child(_chapter_card(chapter))
	if selected_chapter_id.is_empty() and not repo.list_chapters().is_empty():
		selected_chapter_id = str(repo.list_chapters()[0].get("id", ""))
	for entry in repo.list_entries(selected_chapter_id):
		var scene_name := str(entry.get("name", ""))
		if not _search_query.is_empty() and scene_name.findn(_search_query) < 0:
			continue
		_scene_box.add_child(_scene_card(entry))
	if _scene_box.get_child_count() == 0:
		_scene_box.add_child(_label("这个章节还没有场景。", 13, false))


func _refresh_hierarchy() -> void:
	if _hierarchy_box == null:
		return
	if _hierarchy_rename_btn:
		_hierarchy_rename_btn.disabled = model == null or selected_kind not in ["scene", "element", "actor", "water", "background_region", "rain"]
	for child in _hierarchy_box.get_children():
		_hierarchy_box.remove_child(child)
		child.free()
	if model == null:
		_hierarchy_box.add_child(_label("请先在下方 Project 打开场景。", 13, false, true))
		return
	_hierarchy_box.add_child(_hierarchy_button("▾ 场景 · " + model.name, "scene", ""))
	_hierarchy_box.add_child(_hierarchy_button("  背景图", "background", ""))
	for region in model.background_regions:
		_hierarchy_box.add_child(_hierarchy_button("    └ 裁片 · " + str(region.get("name", "底图区域")), "background_region", str(region.get("id", ""))))
	for element in model.elements:
		_hierarchy_box.add_child(_hierarchy_button("  元素 · " + str(element.get("display_name", "元素")), "element", str(element.get("id", ""))))
	for actor in model.actors:
		_hierarchy_box.add_child(_hierarchy_button("  角色 · " + str(actor.get("display_name", "角色")), "actor", str(actor.get("id", ""))))
	for region in model.water_regions:
		_hierarchy_box.add_child(_hierarchy_button("  水流 · " + str(region.get("name", "水域")), "water", str(region.get("id", ""))))
	for region in model.rain_regions:
		_hierarchy_box.add_child(_hierarchy_button("  降雨 · " + str(region.get("name", "降雨区域")), "rain", str(region.get("id", ""))))
	_hierarchy_box.add_child(_hierarchy_button("  特效 · 环境与下雨", "weather", "weather"))


func _hierarchy_button(label_text: String, kind: String, id: String) -> Button:
	var button := _btn(label_text, func() -> void: _select_hierarchy(kind, id))
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and event.double_click:
			_select_hierarchy(kind, id)
			_open_selected_item_rename()
	)
	var selected := selected_kind == kind
	if kind == "element": selected = selected and selected_element_id == id
	elif kind == "actor": selected = selected and selected_actor_id == id
	elif kind == "water": selected = selected and selected_water_id == id
	elif kind == "background_region": selected = selected and selected_region_id == id
	elif kind == "rain": selected = selected and selected_rain_id == id
	button.modulate = Color(1.2, 1.05, 0.68) if selected else Color.WHITE
	return button


func _select_hierarchy(kind: String, id: String) -> void:
	selected_kind = kind
	selected_element_id = id if kind == "element" else ""
	selected_actor_id = id if kind == "actor" else ""
	selected_water_id = id if kind == "water" else ""
	selected_region_id = id if kind == "background_region" else ""
	selected_rain_id = id if kind == "rain" else ""
	selected_point = -2
	match kind:
		"water": _select_tab(1)
		"actor": _select_tab(2)
		"weather", "rain": _select_tab(3)
		_: _select_tab(0)
	_refresh_hierarchy()
	_refresh_inspector()


func _open_selected_item_rename() -> void:
	if model == null:
		return
	if selected_kind == "scene":
		_open_rename(model.scene_id, model.name)
		return
	var current := ""
	match selected_kind:
		"element": current = str(_element_by_id(selected_element_id).get("display_name", "元素"))
		"actor": current = str(actors.actor_by_id(model, selected_actor_id).get("display_name", "角色"))
		"water": current = str(_water_by_id(selected_water_id).get("name", "水域"))
		"background_region": current = str(_background_region_by_id(selected_region_id).get("name", "底图区域"))
		"rain": current = str(_rain_by_id(selected_rain_id).get("name", "降雨区域"))
		_: return
	_rename_item_kind = selected_kind
	_rename_item_id = selected_element_id if selected_kind == "element" else selected_actor_id if selected_kind == "actor" else selected_water_id if selected_kind == "water" else selected_region_id if selected_kind == "background_region" else selected_rain_id
	_rename_item_edit.text = current
	_rename_item_dialog.popup_centered()
	_rename_item_edit.select_all()
	_rename_item_edit.grab_focus()


func _confirm_item_rename() -> void:
	var next_name := _rename_item_edit.text.strip_edges()
	if next_name.length() < DirectorSceneModel.NAME_MIN or next_name.length() > DirectorSceneModel.NAME_MAX:
		_set_status("元素名称须为 1–40 个字符。")
		return
	_begin_cmd()
	match _rename_item_kind:
		"element":
			var element := _element_by_id(_rename_item_id)
			if not element.is_empty(): element["display_name"] = next_name
		"actor":
			var actor := actors.actor_by_id(model, _rename_item_id)
			if not actor.is_empty(): actor["display_name"] = next_name
		"water":
			var region := _water_by_id(_rename_item_id)
			if not region.is_empty(): region["name"] = next_name
		"background_region":
			var bg_region := _background_region_by_id(_rename_item_id)
			if not bg_region.is_empty(): bg_region["name"] = next_name
		"rain":
			var rain_region := _rain_by_id(_rename_item_id)
			if not rain_region.is_empty(): rain_region["name"] = next_name
	_end_cmd()
	_refresh_hierarchy()
	_refresh_inspector()
	_set_status("已重命名为「%s」。" % next_name)


func _chapter_card(chapter: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	var row := HBoxContainer.new()
	panel.add_child(row)
	var cid := str(chapter.get("id", ""))
	var choose := _btn("展开 " + str(chapter.get("name", "章节")), func() -> void:
		selected_chapter_id = cid
		repo.set_active_chapter_id(cid)
		_refresh_scene_list()
	)
	choose.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(choose)
	var menu := MenuButton.new()
	menu.text = "章节操作"
	menu.get_popup().add_item("上移", 0)
	menu.get_popup().add_item("下移", 1)
	menu.get_popup().add_item("重命名", 2)
	menu.get_popup().add_item("删除", 3)
	menu.get_popup().id_pressed.connect(func(id: int) -> void:
		match id:
			0: repo.move_chapter(cid, -1); _refresh_scene_list()
			1: repo.move_chapter(cid, 1); _refresh_scene_list()
			2: _open_rename_chapter(cid, str(chapter.get("name", "")))
			3: _open_delete_chapter(cid, str(chapter.get("name", "")))
	)
	row.add_child(menu)
	if cid == selected_chapter_id:
		panel.modulate = Color(1.08, 1.02, 0.78)
	return panel


func _scene_card(entry: Dictionary) -> PanelContainer:
	var panel := PanelContainer.new()
	var row := HBoxContainer.new()
	panel.add_child(row)
	var indent := Control.new()
	indent.custom_minimum_size.x = 12
	row.add_child(indent)
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
	menu.text = "操作"
	menu.get_popup().add_item("重命名", 0)
	menu.get_popup().add_item("删除", 1)
	menu.get_popup().add_item("上移", 2)
	menu.get_popup().add_item("下移", 3)
	menu.get_popup().id_pressed.connect(func(id: int) -> void:
		if id == 0:
			_open_rename(sid, str(entry.get("name", "")))
		elif id == 1:
			_open_delete(sid, str(entry.get("name", "")))
		elif id == 2:
			repo.move_scene(sid, -1)
			_refresh_scene_list()
		elif id == 3:
			repo.move_scene(sid, 1)
			_refresh_scene_list()
	)
	row.add_child(menu)
	if model and sid == model.scene_id:
		panel.modulate = Color(1.15, 1.05, 0.8)
	return panel


func _refresh_inspector() -> void:
	if _tab_pages.size() < 4:
		return
	if _inspector_title:
		var labels := {"background": "背景属性", "element": "元素属性", "actor": "角色属性", "water": "水流属性", "background_region": "裁片区域属性", "rain": "降雨区域属性", "weather": "特效属性", "scene": "场景属性"}
		_inspector_title.text = "属性 / " + str(labels.get(selected_kind, "Inspector"))
	_loading = true
	_fill_scene_tab()
	_fill_water_tab()
	_fill_actor_tab()
	_fill_weather_tab()
	_loading = false


func _tab_inner(index: int) -> VBoxContainer:
	if index < 0 or index >= _tab_pages.size():
		return null
	return _tab_pages[index].get_node("Inner") as VBoxContainer


func _clear_inner(inner: VBoxContainer) -> void:
	while inner.get_child_count() > 0:
		var child := inner.get_child(0)
		inner.remove_child(child)
		child.free()


func _fill_scene_tab() -> void:
	var inner := _tab_inner(0)
	if inner == null:
		return
	_clear_inner(inner)
	inner.add_child(_label("场景", 14, true))
	if model == null:
		inner.add_child(_label("没有打开的场景。", 13, false))
		return
	if selected_kind == "background":
		inner.add_child(_label("当前背景下的裁片区域：%d 块" % model.background_regions.size(), 12, false))
		for item in model.background_regions:
			var region_id := str(item.get("id", ""))
			inner.add_child(_btn("选择 · " + str(item.get("name", "底图区域")), func() -> void: _select_hierarchy("background_region", region_id)))
	inner.add_child(_btn("更换背景", _open_replace_background))
	inner.add_child(_btn("空白画布", _replace_with_blank))
	inner.add_child(_label("摆放元素", 13, true))
	inner.add_child(_label("请从左下资源列表选择素材，再到画布点击放置。", 12, false, true))
	inner.add_child(_btn("套索圈选底图层", func() -> void: _set_mode(Mode.LASSO_REGION)))
	var element := _element_by_id(selected_element_id)
	if not element.is_empty():
		inner.add_child(_label("当前元素：" + str(element.get("display_name", "元素")), 13, true))
		inner.add_child(_label("显示层级（越高越靠前）", 12, false))
		var element_layer := SpinBox.new()
		element_layer.min_value = -100
		element_layer.max_value = 100
		element_layer.step = 1
		element_layer.value = int(element.get("layer", 0))
		element_layer.value_changed.connect(func(value: float) -> void:
			if _loading: return
			_begin_cmd(); element["layer"] = int(value); _end_cmd(); _sync_world()
		)
		inner.add_child(element_layer)
		inner.add_child(_label("缩放倍率（也可用左侧缩放工具）", 12, false))
		var element_scale := HSlider.new()
		element_scale.min_value = 0.05
		element_scale.max_value = 4.0
		element_scale.step = 0.05
		element_scale.value = float(element.get("scale", 0.5))
		element_scale.tooltip_text = "%.2f 倍" % element_scale.value
		element_scale.drag_started.connect(_begin_cmd)
		element_scale.value_changed.connect(func(value: float) -> void:
			if _loading: return
			element["scale"] = value
			element_scale.tooltip_text = "%.2f 倍" % value
			content.rebuild(model)
		)
		element_scale.drag_ended.connect(func(_changed: bool) -> void: _end_cmd())
		inner.add_child(element_scale)
		inner.add_child(_label("旋转角度（也可用左侧旋转工具）", 12, false))
		var element_rotation := SpinBox.new()
		element_rotation.min_value = -180.0
		element_rotation.max_value = 180.0
		element_rotation.step = 1.0
		element_rotation.suffix = "°"
		element_rotation.value = float(element.get("rotation_degrees", 0.0))
		element_rotation.value_changed.connect(func(value: float) -> void:
			if _loading: return
			_begin_cmd()
			element["rotation_degrees"] = value
			_end_cmd()
			content.rebuild(model)
		)
		inner.add_child(element_rotation)
		inner.add_child(_checkbox("水平镜像", bool(element.get("flip_h", false)), func(value: bool) -> void:
			if _loading: return
			_begin_cmd(); element["flip_h"] = value; _end_cmd(); _sync_world()
		))
		var motion_button := _btn("添加路线（后续开放）", func() -> void: pass)
		motion_button.disabled = true
		motion_button.tooltip_text = "当前仅角色支持路线；普通元素路线已预留。"
		inner.add_child(motion_button)
		inner.add_child(_btn("删除当前元素", _delete_selected_element))
	var bg_region := _background_region_by_id(selected_region_id)
	if not bg_region.is_empty():
		inner.add_child(_label("当前底图区域", 13, true))
		inner.add_child(_label("区域显示层级", 12, false))
		var region_layer := SpinBox.new()
		region_layer.min_value = -100
		region_layer.max_value = 100
		region_layer.step = 1
		region_layer.value = int(bg_region.get("layer", 1))
		region_layer.value_changed.connect(func(value: float) -> void:
			if _loading: return
			_begin_cmd(); bg_region["layer"] = int(value); _end_cmd(); _sync_world()
		)
		inner.add_child(region_layer)
		inner.add_child(_btn("删除底图区域", _delete_selected_region))
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
	if inner == null:
		return
	_clear_inner(inner)
	inner.add_child(_label("水域", 14, true))
	var water_create := HBoxContainer.new()
	water_create.add_child(_btn("矩形框选", func() -> void: _set_mode(Mode.BOX_WATER)))
	water_create.add_child(_btn("套索 / 多边形", func() -> void: _set_mode(Mode.LASSO_WATER)))
	inner.add_child(water_create)
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		inner.add_child(_label("在画布框选或点选一块水域。", 13, false))
		return
	inner.add_child(_label("形状：%s" % ("多边形" if str(region.get("shape", "rect")) == "polygon" else "可缩放矩形"), 12, false))
	inner.add_child(_label("显示层级", 13, true))
	var water_layer := SpinBox.new()
	water_layer.min_value = -100
	water_layer.max_value = 100
	water_layer.step = 1
	water_layer.value = int(region.get("layer", -15))
	water_layer.value_changed.connect(func(value: float) -> void:
		if _loading: return
		_begin_cmd(); region["layer"] = int(value); _end_cmd(); _sync_world()
	)
	inner.add_child(water_layer)
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
		selected_kind = "background"
		_end_cmd()
		_sync_world()
		_refresh_inspector()
		_refresh_hierarchy()
	))


func _fill_actor_tab() -> void:
	var inner := _tab_inner(2)
	if inner == null:
		return
	_clear_inner(inner)
	inner.add_child(_label("多角色", 14, true))
	inner.add_child(_btn("添加角色", _add_actor_clicked, 36.0))
	if model:
		for item in model.actors:
			var actor_id := str(item.get("id", ""))
			var choose := _btn(("当前 " if actor_id == selected_actor_id else "选择 ") + str(item.get("display_name", "角色")), func() -> void:
				selected_kind = "actor"
				selected_actor_id = actor_id
				selected_point = -2
				_refresh_inspector()
				_refresh_hierarchy()
			)
			inner.add_child(choose)
	var actor := actors.actor_by_id(model, selected_actor_id) if model else {}
	if actor.is_empty():
		inner.add_child(_label("点画布上的角色或上方列表，才会显示和编辑该角色路线。", 13, false, true))
		return
	inner.add_child(_label("当前：" + str(actor.get("display_name", "角色")), 13, true))
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
	inner.add_child(_checkbox("显示这条路线", bool(actor.get("route", {}).get("visible", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		var r: Dictionary = actor.get("route", {})
		r["visible"] = v
		actor["route"] = r
		_end_cmd()
	))
	inner.add_child(_label("显示层级（同层按脚底 Y 排序）", 12, false, true))
	var actor_layer := SpinBox.new()
	actor_layer.min_value = -100
	actor_layer.max_value = 100
	actor_layer.step = 1
	actor_layer.value = int(actor.get("layer", 0))
	actor_layer.value_changed.connect(func(value: float) -> void:
		if _loading: return
		_begin_cmd(); actor["layer"] = int(value); _end_cmd(); _sync_world()
	)
	inner.add_child(actor_layer)
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
	inner.add_child(_btn("删除当前角色", func() -> void:
		_begin_cmd()
		for i in range(model.actors.size() - 1, -1, -1):
			if str(model.actors[i].get("id", "")) == selected_actor_id:
				model.actors.remove_at(i)
		selected_actor_id = str(model.actors[0].get("id", "")) if not model.actors.is_empty() else ""
		selected_kind = "actor" if not selected_actor_id.is_empty() else "background"
		_end_cmd()
		_sync_world()
		_refresh_inspector()
		_refresh_hierarchy()
	))


func _fill_weather_tab() -> void:
	var inner := _tab_inner(3)
	if inner == null:
		return
	_clear_inner(inner)
	inner.add_child(_label("环境与天气", 14, true))
	if model == null:
		return
	inner.add_child(_label("时段", 13, true))
	var time_select := OptionButton.new()
	var times := [["早晨", "morning"], ["中午", "noon"], ["傍晚", "evening"], ["夜晚", "night"]]
	var current_time := str(model.weather.get("time_of_day", "noon"))
	for i in range(times.size()):
		time_select.add_item(str(times[i][0]), i)
		time_select.set_item_metadata(i, times[i][1])
		if str(times[i][1]) == current_time:
			time_select.select(i)
	time_select.item_selected.connect(func(index: int) -> void:
		if _loading: return
		_begin_cmd()
		model.weather["time_of_day"] = str(time_select.get_item_metadata(index))
		_end_cmd()
		_apply_weather_effects()
	)
	inner.add_child(time_select)
	inner.add_child(_checkbox("夜晚启用月光", bool(model.weather.get("moonlight_enabled", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd(); model.weather["moonlight_enabled"] = v; _end_cmd()
		_apply_weather_effects()
	))
	inner.add_child(_label("月光强度（仅夜晚生效）", 12, false))
	var moon := HSlider.new()
	moon.min_value = 0.0
	moon.max_value = 1.0
	moon.step = 0.01
	moon.value = float(model.weather.get("moonlight_intensity", 0.65))
	moon.drag_started.connect(_begin_cmd)
	moon.value_changed.connect(func(v: float) -> void:
		if _loading: return
		model.weather["moonlight_intensity"] = v
		weather.apply(model)
	)
	moon.drag_ended.connect(func(_changed: bool) -> void: _end_cmd())
	inner.add_child(moon)
	inner.add_child(HSeparator.new())
	inner.add_child(_checkbox("启用天气", bool(model.weather.get("enabled", false)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd()
		model.weather["enabled"] = v
		_end_cmd()
		_apply_weather_effects()
	))
	inner.add_child(_label("天气效果：全屏下雨", 13, false))
	inner.add_child(_label("雨线始终覆盖整个屏幕并从上往下落；框定区域只负责雨滴终点和落点反馈。关闭天气不影响所选时段。", 12, false, true))
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
		_apply_weather_effects()
	)
	sl.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(sl)
	inner.add_child(HSeparator.new())
	inner.add_child(_label("雷电闪光", 13, true))
	inner.add_child(_checkbox("下雨时启用打闪", bool(model.weather.get("lightning_enabled", false)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd(); model.weather["lightning_enabled"] = v; _end_cmd(); _apply_weather_effects()
	))
	inner.add_child(_label("闪光强度", 12, false))
	var lightning_strength := HSlider.new()
	lightning_strength.min_value = 0.0
	lightning_strength.max_value = 1.0
	lightning_strength.step = 0.01
	lightning_strength.value = float(model.weather.get("lightning_intensity", 0.75))
	lightning_strength.drag_started.connect(_begin_cmd)
	lightning_strength.value_changed.connect(func(v: float) -> void:
		if _loading: return
		model.weather["lightning_intensity"] = v; weather.apply(model)
	)
	lightning_strength.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(lightning_strength)
	inner.add_child(_label("闪光频率", 12, false))
	var lightning_frequency := HSlider.new()
	lightning_frequency.min_value = 0.0
	lightning_frequency.max_value = 1.0
	lightning_frequency.step = 0.01
	lightning_frequency.value = float(model.weather.get("lightning_frequency", 0.35))
	lightning_frequency.drag_started.connect(_begin_cmd)
	lightning_frequency.value_changed.connect(func(v: float) -> void:
		if _loading: return
		model.weather["lightning_frequency"] = v; weather.apply(model)
	)
	lightning_frequency.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(lightning_frequency)
	inner.add_child(HSeparator.new())
	inner.add_child(_label("风", 13, true))
	inner.add_child(_checkbox("启用风效", bool(model.weather.get("wind_enabled", false)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd(); model.weather["wind_enabled"] = v; _end_cmd(); _apply_weather_effects()
	))
	inner.add_child(_label("风向", 12, false))
	var wind_select := OptionButton.new()
	var wind_options := [
		["向右", Vector2.RIGHT], ["向左", Vector2.LEFT], ["向下", Vector2.DOWN], ["向上", Vector2.UP],
		["右下", Vector2(1, 1).normalized()], ["右上", Vector2(1, -1).normalized()],
		["左下", Vector2(-1, 1).normalized()], ["左上", Vector2(-1, -1).normalized()],
	]
	var current_wind := DirectorSceneModel._vec2(model.weather.get("wind_direction", [1, 0]), Vector2.RIGHT).normalized()
	var best_wind_index := 0
	var best_wind_dot := -2.0
	for i in range(wind_options.size()):
		var direction: Vector2 = wind_options[i][1]
		wind_select.add_item(str(wind_options[i][0]), i)
		wind_select.set_item_metadata(i, direction)
		if current_wind.dot(direction) > best_wind_dot:
			best_wind_dot = current_wind.dot(direction)
			best_wind_index = i
	wind_select.select(best_wind_index)
	wind_select.item_selected.connect(func(index: int) -> void:
		if _loading: return
		var direction: Vector2 = wind_select.get_item_metadata(index)
		_begin_cmd(); model.weather["wind_direction"] = DirectorSceneModel.vec2_to_arr(direction); _end_cmd(); _apply_weather_effects()
	)
	inner.add_child(wind_select)
	inner.add_child(_label("风力（会改变雨线倾斜和移动方向）", 12, false))
	var wind_strength := HSlider.new()
	wind_strength.min_value = 0.0
	wind_strength.max_value = 1.0
	wind_strength.step = 0.01
	wind_strength.value = float(model.weather.get("wind_strength", 0.45))
	wind_strength.drag_started.connect(_begin_cmd)
	wind_strength.value_changed.connect(func(v: float) -> void:
		if _loading: return
		model.weather["wind_strength"] = v; _apply_weather_effects()
	)
	wind_strength.drag_ended.connect(func(_c: bool) -> void: _end_cmd())
	inner.add_child(wind_strength)
	inner.add_child(HSeparator.new())
	inner.add_child(_label("降雨区域", 13, true))
	var create_row := HBoxContainer.new()
	create_row.add_child(_btn("圈选（有水花）", func() -> void: _start_rain_lasso(true)))
	create_row.add_child(_btn("圈选（无水花）", func() -> void: _start_rain_lasso(false)))
	inner.add_child(create_row)
	inner.add_child(_label("例：沿屋顶轮廓圈选后，雨幕仍覆盖屏幕，但雨滴会在屋顶范围形成终点；树冠可关闭水花，地面可开启。", 12, false, true))
	var region := _rain_by_id(selected_rain_id)
	if region.is_empty():
		inner.add_child(_label("尚未选择降雨区域；可在上方开始圈选，或从 Hierarchy 选择。", 12, false, true))
		return
	inner.add_child(_label("当前：" + str(region.get("name", "降雨区域")), 13, true))
	inner.add_child(_checkbox("启用这个区域", bool(region.get("enabled", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd(); region["enabled"] = v; _end_cmd(); _apply_weather_effects()
	))
	inner.add_child(_checkbox("落点显示水花", bool(region.get("splashes_enabled", true)), func(v: bool) -> void:
		if _loading: return
		_begin_cmd(); region["splashes_enabled"] = v; _end_cmd(); _apply_weather_effects()
	))
	inner.add_child(_label("显示层级", 12, false))
	var rain_layer := SpinBox.new()
	rain_layer.min_value = -100
	rain_layer.max_value = 100
	rain_layer.step = 1
	rain_layer.value = int(region.get("layer", 30))
	rain_layer.value_changed.connect(func(v: float) -> void:
		if _loading: return
		_begin_cmd(); region["layer"] = int(v); _end_cmd(); _apply_weather_effects()
	)
	inner.add_child(rain_layer)
	inner.add_child(_btn("删除降雨区域", _delete_selected_rain))


func _add_actor_clicked() -> void:
	if model == null:
		return
	if model.actors.size() >= DirectorSceneModel.ACTORS_MAX_PARSE:
		_set_status("角色数量已达上限。")
		return
	_begin_cmd()
	var offset := Vector2(0.04 * (model.actors.size() % 5), 0.04 * (model.actors.size() % 3))
	var actor := _new_actor(CharacterRegistry.FARMER, (Vector2(0.42, 0.42) + offset).clamp(Vector2.ZERO, Vector2.ONE), [])
	model.actors.append(actor)
	selected_actor_id = str(actor.get("id", ""))
	selected_kind = "actor"
	_end_cmd()
	_sync_world()
	_select_tab(2)
	_refresh_inspector()
	_refresh_hierarchy()
	_set_status("已添加角色。点选角色后编辑它自己的路线。")


func _start_rain_lasso(with_splashes: bool) -> void:
	if model == null:
		_set_status("请先打开或新建场景。")
		return
	_new_rain_splashes = with_splashes
	if not bool(model.weather.get("enabled", false)) or str(model.weather.get("type", "rain")) != "rain":
		_begin_cmd()
		model.weather["enabled"] = true
		model.weather["type"] = "rain"
		_end_cmd()
		_apply_weather_effects()
	_set_mode(Mode.LASSO_RAIN)


func _apply_weather_effects() -> void:
	if model == null:
		weather.apply(null)
		rain.rebuild(null)
		return
	weather.apply(model)
	rain.rebuild(model)


func _set_mode(next: Mode) -> void:
	if next != Mode.PREVIEW and (preview.is_playing() or preview.is_paused()):
		return
	if next != Mode.SELECT:
		_placing_asset = false
	if next not in [Mode.LASSO_WATER, Mode.LASSO_REGION, Mode.LASSO_RAIN]:
		_lasso_points = PackedVector2Array()
	mode = next
	_refresh_mode_buttons()
	_update_catcher()
	match mode:
		Mode.SELECT:
			_set_status("移动 V：左键选中并拖动；中键拖动画布，滚轮以鼠标位置缩放。")
		Mode.BOX_WATER:
			_set_status("框选水域：拖出矩形，或在对角再点一次结束。")
		Mode.LASSO_WATER:
			_lasso_points = PackedVector2Array()
			_set_status("套索水域：逐点勾画，双击、回点或 Enter 闭合。")
		Mode.LASSO_REGION:
			_lasso_points = PackedVector2Array()
			_set_status("圈底图层：逐点勾画要抬高/压低的底图区域。")
		Mode.LASSO_RAIN:
			_lasso_points = PackedVector2Array()
			_set_status("圈雨滴终点：雨幕始终全屏；框定屋顶、树木或地面，当前%s水花。" % ("显示" if _new_rain_splashes else "不显示"))
		Mode.EDIT_ROUTE:
			_set_status("编辑路线：左键加点，Backspace 删末点。")
		Mode.SCALE:
			_set_status("缩放 Ctrl/Cmd+T：选中图片元素，再拖动四角控制点。")
		Mode.ROTATE:
			_set_status("旋转：选中图片元素，再拖动外圈；Shift 吸附 15°。")
		Mode.PREVIEW:
			_set_status("预览中：编辑已锁定。Space 播放/暂停。")


func _refresh_mode_buttons() -> void:
	for key in _mode_btns:
		var button: Button = _mode_btns[key]
		button.modulate = Color(1.15, 0.95, 0.55) if key == mode else Color.WHITE
		button.disabled = model == null or mode == Mode.PREVIEW


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
	if model.actors.is_empty():
		_set_status("请先添加角色。")
		return false
	if preview.is_paused() and actors.any_playing():
		actors.resume_all()
		preview.state = PreviewController.State.PLAYING
		_play_had_actor = true
		_set_mode(Mode.PREVIEW)
		return true
	preview.mark_enter_preview(mode if mode != Mode.PREVIEW else preview.previous_mode)
	actors.place_all_at_start(village, model)
	var started := actors.play_all(village, model)
	if started == 0:
		_set_status("至少一名角色的路线需要包含起点之外的目标点")
		return false
	_play_had_actor = true
	preview.state = PreviewController.State.PLAYING
	preview.clock = 0.0
	_set_mode(Mode.PREVIEW)
	_set_status("播放当前场景：%d 名角色各按自己的速度行走" % started)
	return true


func _pause_preview() -> void:
	if not actors.any_playing():
		return
	actors.pause_all()
	preview.state = PreviewController.State.PAUSED
	_set_status("已暂停")


func _stop_preview(change_mode: bool) -> void:
	actors.stop_all("stop")
	_play_had_actor = false
	preview.state = PreviewController.State.STOPPED
	preview.clock = 0.0
	if model:
		actors.place_all_at_start(village, model)
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
		actors.stop_all("stop")
		preview.state = PreviewController.State.STOPPED
		_play_had_actor = false
		if model:
			actors.place_all_at_start(village, model)
		if preview.entered_preview:
			_set_mode(preview.mark_leave_preview() as Mode)
		_set_status("已停止预览，WASD 走位不会改路线")
		return
	if reason == "end":
		if not actors.any_playing():
			_on_ensemble_ended()


func _on_ensemble_ended() -> void:
	if preview.loop_preview:
		preview.state = PreviewController.State.STOPPED
		_try_play()
		return
	preview.state = PreviewController.State.STOPPED
	if preview.entered_preview:
		_set_mode(preview.mark_leave_preview() as Mode)
	_set_status("当前场景播放结束")


func _on_escape() -> void:
	if preview.is_playing() or preview.is_paused():
		_stop_preview(true)
		return
	if mode == Mode.PREVIEW:
		_set_mode(Mode.SELECT)
		return
	if _placing_asset:
		_placing_asset = false
		_set_status("已取消素材放置。")
		return
	if _drag == DragKind.BOX:
		_drag = DragKind.NONE
		_update_catcher()
		_set_status("已取消框选。")
		return
	if mode in [Mode.LASSO_WATER, Mode.LASSO_REGION, Mode.LASSO_RAIN]:
		_lasso_points = PackedVector2Array()
		_set_mode(Mode.SELECT)
		_set_status("已取消套索。")
		return
	if mode != Mode.SELECT:
		_set_mode(Mode.SELECT)


func _preview_locked_edits() -> bool:
	return preview.is_playing() or preview.is_paused()


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
	if selected_chapter_id.is_empty():
		selected_chapter_id = repo.active_chapter_id()
	repo.set_active_chapter_id(selected_chapter_id)
	_new_source = "preset"
	_pending_bytes = PackedByteArray()
	_pending_filename = ""
	_new_name.text = ""
	_new_dialog.popup_centered()
	_new_name.grab_focus()


func _open_new_chapter_dialog() -> void:
	_new_chapter_name.text = ""
	_new_chapter_dialog.popup_centered()
	_new_chapter_name.grab_focus()


func _confirm_new_chapter() -> void:
	var chapter_id := repo.create_chapter(_new_chapter_name.text)
	if chapter_id.is_empty():
		_set_status(repo.last_error)
		return
	selected_chapter_id = chapter_id
	_refresh_scene_list()
	_set_status("已新建章节。")


func _open_rename_chapter(chapter_id: String, current: String) -> void:
	_rename_chapter_id = chapter_id
	_rename_chapter_edit.text = current
	_rename_chapter_dialog.popup_centered()
	_rename_chapter_edit.grab_focus()


func _confirm_rename_chapter() -> void:
	if not repo.rename_chapter(_rename_chapter_id, _rename_chapter_edit.text):
		_set_status(repo.last_error)
		return
	_refresh_scene_list()


func _open_delete_chapter(chapter_id: String, current: String) -> void:
	_delete_chapter_id = chapter_id
	_delete_chapter_dialog.dialog_text = "确定删除章节「%s」及其全部场景？此操作不可撤销。" % current
	_delete_chapter_dialog.popup_centered()


func _confirm_delete_chapter() -> void:
	var deleting_current := model != null and repo.chapter_for_scene(model.scene_id) == _delete_chapter_id
	if not repo.delete_chapter(_delete_chapter_id):
		_set_status(repo.last_error)
		return
	selected_chapter_id = repo.active_chapter_id()
	if deleting_current:
		var next := repo.list_entries(selected_chapter_id)
		if next.is_empty(): _set_empty_scene()
		else: open_scene(str(next[0].get("id", "")), true)
	_refresh_scene_list()
	_set_status("已删除章节及其中场景。")


func _confirm_new_scene() -> void:
	if repo == null:
		return
	if selected_chapter_id.is_empty():
		selected_chapter_id = repo.active_chapter_id()
	var target_chapter_id := selected_chapter_id
	_flush_save()
	var scene: DirectorSceneModel = null
	match _new_source:
		"blank":
			scene = repo.create_blank_scene(_new_name.text, target_chapter_id)
		"uploaded":
			if _pending_bytes.is_empty():
				_set_status("请先选择图片")
				return
			scene = repo.create_uploaded_scene(_new_name.text, _pending_bytes, _pending_filename, target_chapter_id)
		_:
			scene = repo.create_preset_scene(_new_name.text, target_chapter_id)
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
	if _pick_reason.begins_with("custom_asset:"):
		var category := _pick_reason.trim_prefix("custom_asset:")
		var imported := asset_library.import_image(bytes, filename, category)
		if imported.is_empty():
			_set_status(asset_library.last_error if not asset_library.last_error.is_empty() else "无法导入自定义资源")
			return
		_resource_scope = "custom"
		_rebuild_asset_drawer()
		_set_status("已导入自定义资源：%s" % str(imported.get("name", filename)))
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
		"name": "矩形水域 %d" % (model.water_regions.size() + 1),
		"enabled": true,
		"shape": "rect",
		"rect_uv": [DirectorSceneModel.snap6(uv.position.x), DirectorSceneModel.snap6(uv.position.y), DirectorSceneModel.snap6(uv.size.x), DirectorSceneModel.snap6(uv.size.y)],
		"flow_dir": DirectorSceneModel.vec2_to_arr(flow),
		"flow_speed": 0.22,
		"collision_enabled": true,
		"layer": -15,
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
	var actor := _new_actor(character_id, start, points)
	if model.actors.is_empty():
		model.actors.append(actor)
	else:
		var keep_id := str(model.actors[0].get("id", actor.get("id", "")))
		actor["id"] = keep_id
		model.actors[0] = actor
	selected_actor_id = str(actor.get("id", ""))


func _new_actor(character_id: String, start: Vector2, points: Array) -> Dictionary:
	var pts: Array = []
	for item in points:
		pts.append(DirectorSceneModel.vec2_to_arr(item))
	return {
			"id": DirectorSceneModel.new_hex_id("actor_", 4),
			"character_id": character_id,
			"display_name": CharacterRegistry.display_name(character_id),
			"enabled": true,
			"start_uv": DirectorSceneModel.vec2_to_arr(start),
			"layer": 0,
			"route": {
				"points_uv": pts,
				"speed_px_per_sec": 210.0,
				"loop": false,
				"collision_mode": "ignore",
				"visible": true,
			},
		}


func can_drop_asset(_at_position: Vector2, data: Variant) -> bool:
	if model == null or _preview_locked_edits() or not (data is Dictionary):
		return false
	return str(data.get("kind", "")) == "director_asset" and SceneContentController.asset_exists(str(data.get("asset_id", "")))


func drop_asset(_at_position: Vector2, data: Variant) -> void:
	if not can_drop_asset(_at_position, data):
		return
	_place_asset_at(str(data.get("asset_id", "")), village.world_to_uv(village.get_global_mouse_position()))


func _choose_asset_for_canvas(asset_id: String) -> void:
	if model == null:
		_set_status("请先打开或新建场景。")
		return
	if _preview_locked_edits():
		_set_status("播放模式中不能放置素材。")
		return
	if not content.has_asset(asset_id):
		_set_status("找不到资源。")
		return
	_asset_choice = asset_id
	_placing_asset = true
	_set_mode(Mode.SELECT)
	_set_status("已选择%s；请在画布点击放置。" % content.asset_label_for(asset_id))


func _place_asset_at(asset_id: String, uv: Vector2) -> void:
	if model == null or not content.has_asset(asset_id):
		return
	var asset := SceneContentController.asset_info(asset_id)
	var is_custom := asset.is_empty()
	var custom_info := asset_library.info(asset_id) if is_custom else {}
	_begin_cmd()
	var element := {
		"id": DirectorSceneModel.new_hex_id("element_", 4), "asset_id": asset_id,
		"display_name": content.asset_label_for(asset_id), "enabled": true,
		"position_uv": DirectorSceneModel.vec2_to_arr(uv.clamp(Vector2.ZERO, Vector2.ONE)),
		"layer": int(asset.get("default_layer", 0)),
		"scale": float(asset.get("default_scale", 0.5 if not is_custom else 1.0)),
		"rotation_degrees": 0.0,
		"flip_h": false,
	}
	if is_custom:
		element["custom_category"] = str(custom_info.get("category", ""))
	model.elements.append(element)
	selected_element_id = str(element["id"])
	selected_actor_id = ""
	selected_water_id = ""
	selected_region_id = ""
	selected_rain_id = ""
	selected_kind = "element"
	_placing_asset = false
	_end_cmd()
	_sync_world()
	_refresh_hierarchy()
	_refresh_inspector()
	_set_status("已放置%s；可拖动脚底锚点继续调整。" % content.asset_label_for(asset_id))


func _delete_selected_element() -> void:
	_begin_cmd()
	for i in range(model.elements.size() - 1, -1, -1):
		if str(model.elements[i].get("id", "")) == selected_element_id:
			model.elements.remove_at(i)
	selected_element_id = ""
	selected_kind = "background"
	_end_cmd()
	_sync_world()
	_refresh_hierarchy()
	_refresh_inspector()


func _delete_selected_region() -> void:
	_begin_cmd()
	for i in range(model.background_regions.size() - 1, -1, -1):
		if str(model.background_regions[i].get("id", "")) == selected_region_id:
			model.background_regions.remove_at(i)
	selected_region_id = ""
	selected_kind = "background"
	_end_cmd()
	_sync_world()
	_refresh_hierarchy()
	_refresh_inspector()


func _delete_selected_rain() -> void:
	if model == null or selected_rain_id.is_empty():
		return
	_begin_cmd()
	for i in range(model.rain_regions.size() - 1, -1, -1):
		if str(model.rain_regions[i].get("id", "")) == selected_rain_id:
			model.rain_regions.remove_at(i)
	selected_rain_id = ""
	selected_kind = "weather"
	_end_cmd()
	_apply_weather_effects()
	_refresh_hierarchy()
	_refresh_inspector()


func _element_by_id(id: String) -> Dictionary:
	if model == null:
		return {}
	for element in model.elements:
		if str(element.get("id", "")) == id:
			return element
	return {}


func _background_region_by_id(id: String) -> Dictionary:
	if model == null:
		return {}
	for region in model.background_regions:
		if str(region.get("id", "")) == id:
			return region
	return {}


func _water_by_id(id: String) -> Dictionary:
	if model == null or id.is_empty():
		return {}
	for region in model.water_regions:
		if str(region.get("id", "")) == id:
			return region
	return {}


func _rain_by_id(id: String) -> Dictionary:
	if model == null or id.is_empty():
		return {}
	for region in model.rain_regions:
		if str(region.get("id", "")) == id:
			return region
	return {}


func _drag_move_water(world: Vector2) -> void:
	var region := _water_by_id(selected_water_id)
	if region.is_empty():
		return
	if str(region.get("shape", "rect")) == "polygon":
		var polygon := DirectorSceneModel.points_from_value(region.get("points_uv", []))
		var bounds := DirectorSceneModel.polygon_bounds(polygon)
		var desired := _maybe_snap_uv(village.world_to_uv(world + _drag_world_offset))
		var delta := desired - (bounds.position + bounds.size * 0.5)
		delta.x = clampf(delta.x, -bounds.position.x, 1.0 - bounds.end.x)
		delta.y = clampf(delta.y, -bounds.position.y, 1.0 - bounds.end.y)
		var moved: Array = []
		for point in polygon:
			moved.append(DirectorSceneModel.vec2_to_arr(point + delta))
		region["points_uv"] = moved
		return
	var rect := DirectorSceneModel.rect_from_region(region)
	var uv := _maybe_snap_uv(village.world_to_uv(world + _drag_world_offset))
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


func _drag_water_point(world: Vector2) -> void:
	var region := _water_by_id(selected_water_id)
	if region.is_empty() or str(region.get("shape", "rect")) != "polygon":
		return
	var points: Array = region.get("points_uv", [])
	if selected_point >= 0 and selected_point < points.size():
		points[selected_point] = DirectorSceneModel.vec2_to_arr(_maybe_snap_uv(village.world_to_uv(world)))
		region["points_uv"] = points


func _drag_rain_point(world: Vector2) -> void:
	var region := _rain_by_id(selected_rain_id)
	if region.is_empty():
		return
	var points: Array = region.get("points_uv", [])
	if selected_point >= 0 and selected_point < points.size():
		points[selected_point] = DirectorSceneModel.vec2_to_arr(_maybe_snap_uv(village.world_to_uv(world)))
		region["points_uv"] = points


func _drag_move_element(world: Vector2) -> void:
	var element := _element_by_id(selected_element_id)
	if element.is_empty():
		return
	element["position_uv"] = DirectorSceneModel.vec2_to_arr(_maybe_snap_uv(village.world_to_uv(world + _drag_world_offset)))
	content.rebuild(model)


func _begin_element_transform(world: Vector2) -> void:
	var hit_id := ""
	if not selected_element_id.is_empty():
		if mode == Mode.SCALE and _hit_element_scale_handle(selected_element_id, world):
			hit_id = selected_element_id
		elif mode == Mode.ROTATE and _hit_element_rotation_ring(selected_element_id, world):
			hit_id = selected_element_id
	if hit_id.is_empty():
		var clicked_id := content.hit_element(world)
		if not clicked_id.is_empty():
			selected_kind = "element"
			selected_element_id = clicked_id
			selected_actor_id = ""
			selected_water_id = ""
			selected_region_id = ""
			_select_tab(0)
			_refresh_hierarchy()
			_refresh_inspector()
			_set_status("已选中元素；请拖动四角缩放。" if mode == Mode.SCALE else "已选中元素；请拖动外圈旋转，Shift 吸附 15°。")
		else:
			_set_status("请先点选图片元素，再拖动变换控制点。")
		return
	selected_kind = "element"
	selected_element_id = hit_id
	selected_actor_id = ""
	selected_water_id = ""
	selected_region_id = ""
	_select_tab(0)
	_refresh_hierarchy()
	_refresh_inspector()
	var element := _element_by_id(selected_element_id)
	if element.is_empty():
		_set_status("请先在画布或元素列表选择一个图片元素。")
		return
	_transform_origin = content.element_world_position(selected_element_id)
	_transform_start_distance = maxf(world.distance_to(_transform_origin), 8.0)
	_transform_start_scale = float(element.get("scale", 0.5))
	_transform_start_pointer_angle = (world - _transform_origin).angle()
	_transform_start_rotation = float(element.get("rotation_degrees", 0.0))
	_begin_cmd()
	_drag = DragKind.ELEMENT_SCALE if mode == Mode.SCALE else DragKind.ELEMENT_ROTATE
	_update_catcher()
	_set_status("向外/向内拖动调整缩放。" if mode == Mode.SCALE else "绕脚底锚点拖动调整旋转。")


func _drag_scale_element(world: Vector2) -> void:
	var element := _element_by_id(selected_element_id)
	if element.is_empty():
		return
	var ratio := world.distance_to(_transform_origin) / maxf(_transform_start_distance, 0.001)
	element["scale"] = clampf(_transform_start_scale * ratio, 0.05, 4.0)
	content.rebuild(model)


func _drag_rotate_element(world: Vector2) -> void:
	var element := _element_by_id(selected_element_id)
	if element.is_empty() or world.distance_to(_transform_origin) < 2.0:
		return
	var delta := rad_to_deg((world - _transform_origin).angle() - _transform_start_pointer_angle)
	var degrees := _transform_start_rotation + delta
	if Input.is_key_pressed(KEY_SHIFT):
		degrees = snappedf(degrees, 15.0)
	element["rotation_degrees"] = wrapf(degrees + 180.0, 0.0, 360.0) - 180.0
	content.rebuild(model)


func _drag_route_point(world: Vector2) -> void:
	var actor := actors.actor_by_id(model, selected_actor_id)
	if actor.is_empty():
		return
	var uv := _maybe_snap_uv(village.world_to_uv(world))
	if selected_point == -1:
		uv = _maybe_snap_uv(village.world_to_uv(world + _drag_world_offset))
		actor["start_uv"] = DirectorSceneModel.vec2_to_arr(uv)
		var player := actors.player_for(str(actor.get("id", "")))
		if player:
			player.position = village.uv_to_world(uv)
	elif selected_point >= 0:
		var route: Dictionary = actor.get("route", {})
		var pts: Array = route.get("points_uv", [])
		if selected_point < pts.size():
			pts[selected_point] = DirectorSceneModel.vec2_to_arr(uv)
			route["points_uv"] = pts
			actor["route"] = route


func _nudge_selected_element(key: Key, amount_px: int) -> void:
	var element := _element_by_id(selected_element_id)
	if element.is_empty():
		return
	var delta := Vector2.ZERO
	match key:
		KEY_LEFT: delta.x = -amount_px
		KEY_RIGHT: delta.x = amount_px
		KEY_UP: delta.y = -amount_px
		KEY_DOWN: delta.y = amount_px
	var size := village.terrain_size()
	var uv := DirectorSceneModel._vec2(element.get("position_uv", [0.5, 0.5]), Vector2(0.5, 0.5))
	uv += Vector2(delta.x / maxf(size.x, 1.0), delta.y / maxf(size.y, 1.0))
	_begin_cmd()
	element["position_uv"] = DirectorSceneModel.vec2_to_arr(uv.clamp(Vector2.ZERO, Vector2.ONE))
	_end_cmd()
	content.rebuild(model)


func _pop_route_point() -> void:
	var actor := actors.actor_by_id(model, selected_actor_id)
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


func _hit_element_scale_handle(element_id: String, world: Vector2) -> bool:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var limit := HANDLE * 1.8 / maxf(zoom, 0.2)
	for corner in content.element_world_corners(element_id):
		if corner.distance_to(world) <= limit:
			return true
	return false


func _hit_element_rotation_ring(element_id: String, world: Vector2) -> bool:
	var marker := content.element_world_position(element_id)
	var corners := content.element_world_corners(element_id)
	if corners.size() != 4:
		return false
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var radius := 0.0
	for corner in corners:
		radius = maxf(radius, marker.distance_to(corner))
	radius += HANDLE * 2.0 / maxf(zoom, 0.2)
	return absf(marker.distance_to(world) - radius) <= HANDLE * 2.0 / maxf(zoom, 0.2)


func _hit_water_vertex(region: Dictionary, world: Vector2) -> int:
	if str(region.get("shape", "rect")) != "polygon":
		return -1
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var limit := HANDLE * 1.6 / zoom
	var points: Array = region.get("points_uv", [])
	for i in range(points.size()):
		if village.uv_to_world(DirectorSceneModel._vec2(points[i], Vector2.ZERO)).distance_to(world) <= limit:
			return i
	return -1


func _hit_rain_vertex(region: Dictionary, world: Vector2) -> int:
	var zoom := village.camera.zoom.x if village.camera else 1.0
	var limit := HANDLE * 1.6 / zoom
	var points: Array = region.get("points_uv", [])
	for i in range(points.size()):
		if village.uv_to_world(DirectorSceneModel._vec2(points[i], Vector2.ZERO)).distance_to(world) <= limit:
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


func _event_screen(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return (event as InputEventMouse).global_position
	return _screen_mouse()


func _event_world(_event: InputEvent) -> Vector2:
	if village == null:
		return Vector2.ZERO
	return village.get_global_mouse_position()


func _screen_mouse() -> Vector2:
	return get_viewport().get_mouse_position()


func _pointer_over_canvas(screen_position: Vector2) -> bool:
	return _canvas_catch != null and _canvas_catch.get_global_rect().has_point(screen_position)


func _update_catcher() -> void:
	if _canvas_catch == null:
		return
	var grab := mode == Mode.BOX_WATER or mode in [Mode.LASSO_WATER, Mode.LASSO_REGION, Mode.LASSO_RAIN] or mode == Mode.EDIT_ROUTE or mode == Mode.SCALE or mode == Mode.ROTATE or _drag != DragKind.NONE
	_canvas_catch.mouse_filter = Control.MOUSE_FILTER_STOP if grab else Control.MOUSE_FILTER_PASS


func _apply_layout() -> void:
	if _top == null:
		return
	var size := get_viewport_rect().size
	_last_layout_size = size
	_narrow = size.x < NARROW
	_top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_top.offset_bottom = TOP_H
	_bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_bottom.offset_top = -BOTTOM_H
	_tools.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_tools.offset_top = TOP_H
	_tools.offset_bottom = -BOTTOM_H
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
		_tools.offset_left = LEFT_W if _left_open else 0.0
		_tools.offset_right = _tools.offset_left + TOOL_W
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
		_tools.offset_left = LEFT_W
		_tools.offset_right = LEFT_W + TOOL_W
	if _canvas_catch:
		_canvas_catch.set_anchors_preset(Control.PRESET_FULL_RECT)
		_canvas_catch.offset_top = TOP_H
		_canvas_catch.offset_bottom = -BOTTOM_H
		if _narrow:
			_canvas_catch.offset_left = (LEFT_W if _left_open else 0.0) + TOOL_W
			_canvas_catch.offset_right = -RIGHT_W if _right_open else 0.0
		else:
			_canvas_catch.offset_left = LEFT_W + TOOL_W
			_canvas_catch.offset_right = -RIGHT_W
	_update_catcher()


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
	if _new_dialog.visible or _rename_dialog.visible or _delete_dialog.visible or _help.visible or _conflict_dialog.visible \
			or _new_chapter_dialog.visible or _rename_chapter_dialog.visible or _delete_chapter_dialog.visible \
			or _replace_background_dialog.visible or _rename_item_dialog.visible:
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
			_save_label.text = "保存中"
		"failed":
			_save_label.text = "保存失败"
		_:
			_save_label.text = "已保存"


func _make_theme() -> Theme:
	var theme := Theme.new()
	var font: Font
	if ResourceLoader.exists("res://fonts/NotoSansCJKsc-Regular.otf"):
		font = load("res://fonts/NotoSansCJKsc-Regular.otf")
	else:
		var sys := SystemFont.new()
		sys.font_names = PackedStringArray(["Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Micro Hei"])
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


func _label(text: String, size: int, bold: bool, wrap: bool = false) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(1.0, 0.96, 0.84) if bold else Color(0.92, 0.88, 0.78))
	label.add_theme_color_override("font_outline_color", Color(0.14, 0.1, 0.06))
	label.add_theme_constant_override("outline_size", 4)
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	else:
		label.autowrap_mode = TextServer.AUTOWRAP_OFF
		label.clip_text = true
	return label


func _btn(text: String, handler: Callable, min_h: float = 28.0) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(0, min_h)
	button.pressed.connect(handler)
	return button


func _checkbox(text: String, pressed: bool, handler: Callable) -> CheckBox:
	var box := CheckBox.new()
	box.text = text
	box.button_pressed = pressed
	box.focus_mode = Control.FOCUS_NONE
	box.toggled.connect(handler)
	return box
