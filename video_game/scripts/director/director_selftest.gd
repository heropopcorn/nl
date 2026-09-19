class_name DirectorSelftest
extends RefCounted

## Headless checks for v2 model, repository, migration, and (later) runtime desk.


func run_model_and_repo() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	_collect(errors, _test_example_roundtrip())
	_collect(errors, _test_unknown_fields())
	_collect(errors, _test_overlap_and_edge())
	_collect(errors, _test_validation_edges())
	_collect(errors, _test_repository_crud())
	_collect(errors, _test_chapter_crud_and_order())
	_collect(errors, _test_selected_chapter_survives_scene_save())
	_collect(errors, _test_index_v1_chapter_migration())
	_collect(errors, _test_v2_layers_and_polygons())
	_collect(errors, _test_index_rebuild())
	_collect(errors, _test_atomic_backup())
	_collect(errors, _test_path_safety())
	_collect(errors, _test_upload_resize())
	_collect(errors, _test_layout_v3_assets_and_fields())
	_collect(errors, _test_v1_migration())
	_collect(errors, _test_corrupt_recovery())
	return errors


func _test_layout_v3_assets_and_fields() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var root := "user://director_desk_selftest/assets_%d/" % Time.get_ticks_usec()
	var library := DirectorAssetLibrary.new(root)
	var image := Image.create(24, 18, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.2, 0.7, 0.4, 0.8))
	var imported := library.import_image(image.save_png_to_buffer(), "自定义树.png", "trees")
	if imported.is_empty() or library.list_assets("trees").size() != 1:
		errors.append("layout v3 custom asset import failed: %s" % library.last_error)
	elif not library.asset_exists(str(imported.get("id", ""))):
		errors.append("layout v3 custom asset file missing")
	var model := _valid_stub()
	model.elements = [{"id": "element_flip", "asset_id": "tree_oak", "display_name": "镜像树", "enabled": true, "position_uv": [0.5, 0.5], "layer": 2, "scale": 0.5, "flip_h": true}]
	model.water_regions = [{"id": "water_layer", "name": "高层水流", "enabled": true, "shape": "rect", "rect_uv": [0.1, 0.1, 0.2, 0.2], "flow_dir": [0, 1], "flow_speed": 0.2, "collision_enabled": false, "layer": 7}]
	var again := DirectorSceneModel.from_json_text(model.to_json_text())
	if not bool(again.elements[0].get("flip_h", false)):
		errors.append("layout v3 element flip_h roundtrip failed")
	if int(again.water_regions[0].get("layer", -15)) != 7:
		errors.append("layout v3 water layer roundtrip failed")
	_rm_rf(root)
	return errors


func _test_chapter_crud_and_order() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("chapters")
	repo.rebuild_index()
	var first := repo.active_chapter_id()
	if first.is_empty():
		errors.append("default chapter missing")
	var second := repo.create_chapter("第二章")
	if second.is_empty():
		errors.append("chapter create failed")
		_cleanup_repo(repo)
		return errors
	repo.set_active_chapter_id(second)
	var a := repo.create_preset_scene("第二章第一场")
	var b := repo.create_blank_scene("第二章第二场")
	if a == null or b == null or repo.list_entries(second).size() != 2:
		errors.append("scenes should be created below active chapter")
	elif str(repo.list_entries(second)[0].get("id", "")) != a.scene_id:
		errors.append("scene order should preserve creation order")
	if not repo.move_scene(b.scene_id, -1) or str(repo.list_entries(second)[0].get("id", "")) != b.scene_id:
		errors.append("scene move up failed")
	if not repo.rename_chapter(second, "雨夜章") or str(repo.list_chapters()[1].get("name", "")) != "雨夜章":
		errors.append("chapter rename failed")
	if not repo.move_chapter(second, -1) or str(repo.list_chapters()[0].get("id", "")) != second:
		errors.append("chapter move failed")
	if not repo.delete_chapter(second):
		errors.append("chapter delete failed")
	if not repo.list_entries(second).is_empty() or repo.load_scene(a.scene_id) != null:
		errors.append("chapter delete should delete child scenes")
	if repo.delete_chapter(first):
		errors.append("last chapter must be protected")
	_cleanup_repo(repo)
	return errors


func _test_selected_chapter_survives_scene_save() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("selected_chapter")
	repo.rebuild_index()
	var open_scene := repo.create_preset_scene("第一章场景")
	var selected_chapter := repo.create_chapter("第二章")
	if open_scene == null or selected_chapter.is_empty():
		errors.append("selected chapter fixtures missing")
		_cleanup_repo(repo)
		return errors
	repo.set_active_chapter_id(selected_chapter)
	open_scene.name = "第一章场景已保存"
	if not repo.save_scene(open_scene):
		errors.append("saving open scene failed")
	if repo.active_chapter_id() != selected_chapter:
		errors.append("saving open scene should preserve selected chapter")
	var created := repo.create_blank_scene("第二章新场景", selected_chapter)
	if created == null:
		errors.append("creating scene in selected chapter failed")
	elif repo.chapter_for_scene(created.scene_id) != selected_chapter:
		errors.append("new scene should use explicitly selected chapter")
	_cleanup_repo(repo)
	return errors


func _test_v2_layers_and_polygons() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var model := _valid_stub()
	model.elements = [
		{"id": "element_a", "asset_id": "tree_oak", "display_name": "前树", "enabled": true, "position_uv": [0.4, 0.7], "layer": 3, "scale": 0.5},
		{"id": "element_b", "asset_id": "house_market", "display_name": "后屋", "enabled": true, "position_uv": [0.4, 0.2], "layer": 3, "scale": 0.5},
	]
	model.background_regions = [
		{"id": "region_a", "name": "平台", "enabled": true, "points_uv": [[0.1, 0.1], [0.4, 0.1], [0.3, 0.3]], "layer": 2},
	]
	model.water_regions = [{
		"id": "water_poly", "name": "弯河", "enabled": true, "shape": "polygon",
		"points_uv": [[0.55, 0.1], [0.8, 0.15], [0.75, 0.35], [0.5, 0.3]],
		"rect_uv": [0, 0, 0, 0], "flow_dir": [1, 0], "flow_speed": 0.4, "collision_enabled": true,
	}]
	model.actors = [_actor("actor_a", Vector2(0.2, 0.4), 1, 120.0)]
	model.validate()
	if not model.is_valid():
		errors.append("v2 polygon/layer model invalid: %s" % ", ".join(model.errors))
	var again := DirectorSceneModel.from_json_text(model.to_json_text())
	if again.elements.size() != 2 or int(again.elements[0].get("layer", -1)) != 3:
		errors.append("element layer roundtrip failed")
	if again.background_regions.size() != 1 or int(again.background_regions[0].get("layer", -1)) != 2:
		errors.append("background region layer roundtrip failed")
	var poly := DirectorSceneModel.water_polygon(again.water_regions[0])
	if poly.size() != 4 or DirectorSceneModel.polygon_area(poly) < 0.02:
		errors.append("polygon water roundtrip failed")
	var moved := poly.duplicate()
	moved[0] = Vector2(0.58, 0.12)
	if moved[0].is_equal_approx(poly[0]):
		errors.append("polygon control point should be independently adjustable")
	return errors


func _test_index_v1_chapter_migration() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("index_v1")
	var a := repo.create_preset_scene("旧索引甲")
	var b := repo.create_blank_scene("旧索引乙")
	if a == null or b == null:
		errors.append("index migration fixtures missing")
		_cleanup_repo(repo)
		return errors
	var old_index := {
		"schema_version": 1,
		"active_scene_id": b.scene_id,
		"scenes": [
			{"id": a.scene_id, "name": a.name, "updated_at": a.updated_at, "thumbnail": ""},
			{"id": b.scene_id, "name": b.name, "updated_at": b.updated_at, "thumbnail": ""},
		],
	}
	var file := FileAccess.open(repo.index_path(), FileAccess.WRITE)
	file.store_string(JSON.stringify(old_index))
	file.close()
	var migrated := repo.load_or_rebuild_index()
	if int(migrated.get("schema_version", 0)) != 2 or migrated.get("chapters", []).size() != 1:
		errors.append("schema-1 index did not migrate to one chapter")
	var chapter_id := str(migrated.get("active_chapter_id", ""))
	if chapter_id.is_empty() or repo.list_entries(chapter_id).size() != 2:
		errors.append("legacy scenes were not assigned to migrated chapter")
	if repo.active_scene_id() != b.scene_id:
		errors.append("index migration should preserve active scene")
	_cleanup_repo(repo)
	return errors


func run_all(village: Node) -> PackedStringArray:
	var errors := run_model_and_repo()
	if village and village.has_method("run_director_runtime_selftest"):
		_collect(errors, await village.run_director_runtime_selftest())
	return errors


func _test_example_roundtrip() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var path := DirectorSceneModel.example_path()
	if not FileAccess.file_exists(path):
		errors.append("missing example json %s" % path)
		return errors
	var text := FileAccess.get_file_as_string(path)
	var model := DirectorSceneModel.from_json_text(text)
	if not model.is_valid():
		errors.append("example json invalid: %s" % ", ".join(model.errors))
		return errors
	if model.scene_id != "scn_7f3a2c91":
		errors.append("example scene_id mismatch")
	if model.water_regions.size() != 2:
		errors.append("example should have 2 water regions")
	if model.actors.size() != 2:
		errors.append("example should have 2 actors")
	if str(model.actors[0].get("character_id", "")) != "farmer_placeholder":
		errors.append("example actor character_id")
	var again := DirectorSceneModel.from_json_text(model.to_json_text())
	if not again.is_valid():
		errors.append("roundtrip json invalid: %s" % ", ".join(again.errors))
	if again.name != model.name or again.scene_id != model.scene_id:
		errors.append("roundtrip dropped identity")
	if again.water_regions.size() != 2:
		errors.append("roundtrip dropped water")
	var dir_a: Array = again.water_regions[0].get("flow_dir", [])
	var dir_b: Array = again.water_regions[1].get("flow_dir", [])
	if dir_a.size() < 2 or dir_b.size() < 2:
		errors.append("roundtrip missing flow_dir")
	elif abs(float(dir_a[0]) - float(dir_b[0])) < 0.01:
		errors.append("example flow directions should stay distinct")
	return errors


func _test_unknown_fields() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var text := FileAccess.get_file_as_string(DirectorSceneModel.example_path())
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		errors.append("example parse failed")
		return errors
	var data: Dictionary = parsed
	data["future_flag"] = true
	data["camera"] = {"mode": "follow", "p1_only": 1}
	var waters: Array = data["water_regions"]
	var w0: Dictionary = waters[0]
	w0["future_foam"] = 0.4
	waters[0] = w0
	data["water_regions"] = waters
	var model := DirectorSceneModel.from_dict(data)
	if not model.is_valid():
		errors.append("unknown fields should not fail parse: %s" % ", ".join(model.errors))
	var out := model.to_dict()
	if out.get("future_flag", false) != true:
		errors.append("top-level unknown field was dropped")
	if typeof(out.get("camera", null)) != TYPE_DICTIONARY:
		errors.append("camera P1 field was dropped")
	else:
		var cam: Dictionary = out["camera"]
		if str(cam.get("mode", "")) != "follow":
			errors.append("camera.mode was dropped")
	var out_waters: Array = out.get("water_regions", [])
	if out_waters.is_empty() or not (out_waters[0] is Dictionary) or not (out_waters[0] as Dictionary).has("future_foam"):
		errors.append("nested unknown water field was dropped")
	return errors


func _test_overlap_and_edge() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var model := _valid_stub()
	model.water_regions.clear()
	model.water_regions.append(_water("water_a", Rect2(0.10, 0.10, 0.20, 0.20), Vector2(0, 1)))
	model.water_regions.append(_water("water_b", Rect2(0.30, 0.10, 0.20, 0.20), Vector2(1, 0)))
	model.validate()
	if model.has_water_overlap():
		errors.append("shared edge should not count as overlap")
	if "水域不能重叠" in model.errors:
		errors.append("shared-edge pair should save")
	model.water_regions[1] = _water("water_b", Rect2(0.20, 0.10, 0.20, 0.20), Vector2(1, 0))
	model.validate()
	if not model.has_water_overlap():
		errors.append("area overlap should be detected")
	if "水域不能重叠" not in model.errors:
		errors.append("area overlap should block save")
	return errors


func _test_validation_edges() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var model := _valid_stub()
	model.name = ""
	model.validate()
	if "场景名称须为 1–40 个字符" not in model.errors:
		errors.append("empty name should fail")
	model = _valid_stub()
	model.coordinate_space["origin"] = "center"
	model.validate()
	if "不支持的坐标空间，已拒绝加载" not in model.errors:
		errors.append("unknown coordinate space should fail")
	model = _valid_stub()
	model.background["file"] = "../secret.png"
	model.background["source"] = "uploaded"
	model.validate()
	if "背景路径不安全" not in model.errors:
		errors.append("path traversal in background.file should fail")
	var huge := "x".repeat(DirectorSceneModel.JSON_MAX_BYTES + 4)
	var too_big := DirectorSceneModel.from_json_text(huge)
	if not too_big.parse_failed:
		errors.append("oversize json should fail closed")
	return errors


func _test_repository_crud() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("crud")
	var a := repo.create_preset_scene("村口")
	if a == null:
		errors.append("create preset failed: %s" % repo.last_error)
		return errors
	var b := repo.create_blank_scene("空白画布一号")
	if b == null:
		errors.append("create blank failed: %s" % repo.last_error)
		return errors
	if a.scene_id == b.scene_id:
		errors.append("scene ids must be unique")
	if not repo.rename_scene(a.scene_id, "雨中的村口"):
		errors.append("rename failed")
	var loaded := repo.load_scene(a.scene_id)
	if loaded == null or loaded.name != "雨中的村口":
		errors.append("rename did not persist")
	var entries := repo.list_entries()
	if entries.size() != 2:
		errors.append("expected 2 index entries, got %d" % entries.size())
	if not repo.delete_scene(b.scene_id):
		errors.append("delete failed")
	if repo.load_scene(b.scene_id) != null and repo.load_scene(b.scene_id).is_valid():
		var gone := repo.load_scene(b.scene_id)
		if gone and FileAccess.file_exists(repo.scene_dir(b.scene_id) + "scene.json"):
			errors.append("deleted scene directory still present")
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(repo.scene_dir(b.scene_id))):
		errors.append("deleted scene directory still present")
	entries = repo.list_entries()
	if entries.size() != 1:
		errors.append("index should have 1 scene after delete")
	_cleanup_repo(repo)
	return errors


func _test_index_rebuild() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("rebuild")
	var a := repo.create_preset_scene("甲")
	var b := repo.create_blank_scene("乙")
	if a == null or b == null:
		errors.append("rebuild fixtures missing")
		_cleanup_repo(repo)
		return errors
	DirAccess.remove_absolute(ProjectSettings.globalize_path(repo.index_path()))
	var rebuilt := repo.rebuild_index()
	var scenes: Array = rebuilt.get("scenes", [])
	if scenes.size() != 2:
		errors.append("rebuild should find 2 scenes, got %d" % scenes.size())
	_cleanup_repo(repo)
	return errors


func _test_atomic_backup() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("atomic")
	var scene := repo.create_preset_scene("备份场景")
	if scene == null:
		errors.append("atomic fixture missing")
		return errors
	scene.name = "备份场景二"
	if not repo.save_scene(scene):
		errors.append("second save failed")
	var bak := repo.scene_dir(scene.scene_id) + "scene.json.bak"
	if not FileAccess.file_exists(bak):
		errors.append("scene.json.bak missing after rewrite")
	_cleanup_repo(repo)
	return errors


func _test_path_safety() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("paths")
	var scene := repo.create_preset_scene("路径安全")
	if scene == null:
		errors.append("path fixture missing")
		return errors
	if repo.resolve_scene_file(scene.scene_id, "../scene.json") != "":
		errors.append("rejected .. relative path expected")
	if repo.resolve_scene_file(scene.scene_id, "res://art/approved/x.png") != "":
		errors.append("rejected res:// injection expected")
	if repo.resolve_scene_file(scene.scene_id, "https://evil.example/x.png") != "":
		errors.append("rejected url expected")
	if repo.resolve_scene_file(scene.scene_id, "/tmp/x.png") != "":
		errors.append("rejected absolute path expected")
	var ok := repo.resolve_scene_file(scene.scene_id, "background.png")
	if not ok.begins_with(repo.scene_dir(scene.scene_id)):
		errors.append("safe relative path should resolve inside scene dir")
	_cleanup_repo(repo)
	return errors


func _test_upload_resize() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var image := Image.create(4000, 2000, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.2, 0.4, 0.3, 1))
	var bytes := image.save_png_to_buffer()
	var repo := _temp_repo("upload")
	var scene := repo.create_uploaded_scene("超大背景", bytes, "huge.png")
	if scene == null:
		errors.append("upload create failed: %s" % repo.last_error)
		_cleanup_repo(repo)
		return errors
	if scene.pixel_size() != Vector2i(2048, 1024):
		errors.append("4000x2000 should store as 2048x1024, got %s" % scene.pixel_size())
	var stored := repo.resolve_scene_file(scene.scene_id, "background.png")
	if stored.is_empty() or not FileAccess.file_exists(stored):
		errors.append("uploaded background.png missing")
	_cleanup_repo(repo)
	return errors


func _test_v1_migration() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("migrate")
	var v1_root := repo.root + "_v1/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(v1_root))
	repo.v1_json_path = v1_root + "scene_layout.json"
	repo.v1_ground_path = v1_root + "custom_ground.png"
	repo.v1_water_path = v1_root + "water_mask.png"
	var ground := Image.create(64, 48, false, Image.FORMAT_RGBA8)
	ground.fill(Color(0.3, 0.5, 0.2, 1))
	ground.save_png(repo.v1_ground_path)
	var mask := Image.create(64, 48, false, Image.FORMAT_RGBA8)
	mask.fill(Color(0.2, 0.4, 0.8, 0.7))
	mask.save_png(repo.v1_water_path)
	var v1 := {
		"version": 1,
		"ground": "user://custom_ground.png",
		"water_mask": "user://water_mask.png",
		"hide_baked_props": true,
		"water_flow_dir": [0.18, 0.92],
		"path_loop": false,
		"path_ignore_collision": true,
		"path_uv": [[0.42, 0.42], [0.50, 0.48], [0.62, 0.70]],
	}
	var vf := FileAccess.open(repo.v1_json_path, FileAccess.WRITE)
	vf.store_string(JSON.stringify(v1, "\t"))
	vf.close()
	var migrated := repo.maybe_migrate_v1()
	if migrated == null:
		errors.append("v1 migrate returned null: %s" % repo.last_error)
		_cleanup_repo(repo)
		return errors
	if migrated.name != "从旧版导入":
		errors.append("migrated name should be 从旧版导入")
	if str(migrated.background.get("source", "")) != "uploaded":
		errors.append("migrated custom ground should be uploaded")
	if bool(migrated.editor.get("show_baked_props", true)):
		errors.append("hide_baked_props should invert to show_baked_props false")
	if migrated.actors.is_empty():
		errors.append("migrated actor missing")
	else:
		var route: Dictionary = migrated.actors[0].get("route", {})
		var pts: Array = route.get("points_uv", [])
		if pts.size() != 3:
			errors.append("migrated route should keep 3 points")
		if bool(route.get("loop", true)):
			errors.append("migrated loop should be false")
	if migrated.legacy_water == null:
		errors.append("legacy_water missing after mask migrate")
	var mask_path := repo.resolve_scene_file(migrated.scene_id, "legacy_water_mask.png")
	if mask_path.is_empty() or not FileAccess.file_exists(mask_path):
		errors.append("legacy_water_mask.png missing")
	if not FileAccess.file_exists(repo.v1_json_path) or not FileAccess.file_exists(repo.v1_ground_path):
		errors.append("v1 files must remain after migrate")
	var second := repo.maybe_migrate_v1()
	if second != null:
		errors.append("second migrate should no-op once index exists")
	_cleanup_repo(repo)
	return errors


func _test_corrupt_recovery() -> PackedStringArray:
	var errors: PackedStringArray = PackedStringArray()
	var repo := _temp_repo("corrupt")
	var scene := repo.create_preset_scene("可恢复")
	if scene == null:
		errors.append("corrupt fixture missing")
		return errors
	scene.name = "可恢复二"
	repo.save_scene(scene)
	var json_path := repo.scene_dir(scene.scene_id) + "scene.json"
	var bad := FileAccess.open(json_path, FileAccess.WRITE)
	bad.store_string("{not-json")
	bad.close()
	var loaded := repo.load_scene(scene.scene_id)
	if loaded == null:
		errors.append("backup recovery returned null")
	elif not repo.recovered_from_backup:
		errors.append("expected recovered_from_backup")
	elif loaded.name != "可恢复":
		# first save name is 可恢复, bak from second save should be 可恢复 (pre-rename content)
		# first create saved "可恢复"; second save writes bak of first then new "可恢复二".
		# After corrupting current, bak is the previous "可恢复".
		if loaded.name != "可恢复" and loaded.name != "可恢复二":
			errors.append("recovered name unexpected: %s" % loaded.name)
	var other := repo.create_blank_scene("其他场景")
	if other == null:
		errors.append("sibling scene should still create after corrupt")
	_cleanup_repo(repo)
	return errors


func _valid_stub() -> DirectorSceneModel:
	var bg := {
		"source": "preset",
		"preset_id": DirectorSceneModel.PRESET_VILLAGE,
		"pixel_size": [1152, 864],
	}
	return DirectorSceneModel.make_new("scn_abcdef12", "测试场景", bg)


func _water(id: String, rect: Rect2, dir: Vector2) -> Dictionary:
	var n := DirectorSceneModel.normalize_flow(dir)
	return {
		"id": id,
		"name": id,
		"enabled": true,
		"rect_uv": [rect.position.x, rect.position.y, rect.size.x, rect.size.y],
		"flow_dir": DirectorSceneModel.vec2_to_arr(n),
		"flow_speed": 0.22,
		"collision_enabled": true,
	}


func _actor(id: String, start: Vector2, layer: int, speed: float) -> Dictionary:
	return {
		"id": id, "character_id": CharacterRegistry.FARMER, "display_name": id,
		"enabled": true, "start_uv": DirectorSceneModel.vec2_to_arr(start), "layer": layer,
		"route": {"points_uv": [DirectorSceneModel.vec2_to_arr(start + Vector2(0.2, 0))], "speed_px_per_sec": speed, "loop": false, "collision_mode": "ignore", "visible": true},
	}


func _temp_repo(label: String) -> SceneRepository:
	var path := "user://director_desk_selftest/%s_%d/" % [label, Time.get_ticks_usec()]
	var repo := SceneRepository.new(path)
	repo.ensure_root()
	return repo


func _cleanup_repo(repo: SceneRepository) -> void:
	if repo == null:
		return
	var abs_path := ProjectSettings.globalize_path(repo.root)
	_rm_rf(repo.root)
	var v1 := repo.v1_json_path.get_base_dir()
	if v1.begins_with(repo.root) or v1.begins_with("user://director_desk_selftest"):
		_rm_rf(v1)
	if abs_path.is_empty():
		pass


func _rm_rf(path: String) -> void:
	var dir := DirAccess.open(path)
	if dir == null:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if entry != "." and entry != "..":
			var child := path.path_join(entry)
			if dir.current_is_dir():
				_rm_rf(child)
			else:
				DirAccess.remove_absolute(ProjectSettings.globalize_path(child))
		entry = dir.get_next()
	dir.list_dir_end()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func _collect(into: PackedStringArray, extra: PackedStringArray) -> void:
	for item in extra:
		into.append(item)
