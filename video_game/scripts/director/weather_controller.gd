class_name WeatherController
extends CanvasLayer

## Screen-space time-of-day grading. Rain itself is rendered in world-space by
## RainRegionController so it can land on selected roofs, trees and ground.

const DAY_SHADER_PATH := "res://shaders/day_cycle.gdshader"

var _day_overlay: ColorRect
var _day_material: ShaderMaterial
var _rain_overlay: ColorRect
var _enabled := false
var _intensity := 0.6
var _time_of_day := "noon"
var _moonlight_enabled := true
var _moonlight_intensity := 0.65


func setup() -> void:
	name = "WeatherCanvas"
	layer = 16
	follow_viewport_enabled = false
	_day_overlay = _make_overlay("DayCycleOverlay")
	_day_material = _make_material(DAY_SHADER_PATH)
	if _day_material.shader:
		_day_overlay.material = _day_material
	add_child(_day_overlay)
	_rain_overlay = _make_overlay("RainOverlay")
	# Keep the named node for old scenes/tools, but never draw the former
	# full-screen rain sheet. RainRegionController owns all visible rain.
	_rain_overlay.visible = false
	add_child(_rain_overlay)
	set_process(true)
	_refresh()


func apply(model: DirectorSceneModel) -> void:
	if model == null:
		_enabled = false
		_time_of_day = "noon"
		_moonlight_enabled = false
		_refresh()
		return
	_enabled = bool(model.weather.get("enabled", false)) and str(model.weather.get("type", "rain")) == "rain"
	_intensity = clampf(float(model.weather.get("intensity", 0.6)), 0.0, 1.0)
	_time_of_day = str(model.weather.get("time_of_day", "noon"))
	_moonlight_enabled = bool(model.weather.get("moonlight_enabled", true))
	_moonlight_intensity = clampf(float(model.weather.get("moonlight_intensity", 0.65)), 0.0, 1.0)
	_refresh()


func set_paused(_paused_value: bool) -> void:
	# Kept as part of the director effect-controller API. The day grade is
	# static; RainRegionController owns animated rain pause/time state.
	pass


func set_director_time(_value: float) -> void:
	pass


func is_raining() -> bool:
	return _enabled


func has_visible_effect() -> bool:
	return false


func applied_intensity() -> float:
	return _intensity if _enabled else 0.0


func applied_time_of_day() -> String:
	return _time_of_day


func applied_moonlight() -> float:
	return _moonlight_intensity if _time_of_day == "night" and _moonlight_enabled else 0.0


func material_moonlight() -> float:
	if _day_material == null or _day_material.shader == null:
		return 0.0
	return float(_day_material.get_shader_parameter("moonlight"))


func _process(_delta: float) -> void:
	_layout_overlays()


func _refresh() -> void:
	if _rain_overlay == null or _day_overlay == null:
		return
	_rain_overlay.visible = false
	_day_overlay.visible = _time_of_day != "noon" or (_time_of_day == "night" and _moonlight_enabled)
	_layout_overlays()
	_apply_day_grade()
	_rain_overlay.material = null
	_rain_overlay.color = Color.TRANSPARENT


func _layout_overlays() -> void:
	var vp := get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	# CanvasLayer has no Control parent. Explicit pixel sizing avoids a zero-size
	# full-rect on Compatibility/Web renderers.
	for overlay in [_day_overlay, _rain_overlay]:
		if overlay:
			overlay.set_anchors_preset(Control.PRESET_TOP_LEFT)
			overlay.position = Vector2.ZERO
			overlay.size = vp


func _apply_day_grade() -> void:
	var settings := {
		"morning": [Color(1.16, 1.02, 0.82), 0.30, 1.04, 1.00],
		"noon": [Color.WHITE, 0.0, 1.0, 1.0],
		"evening": [Color(1.20, 0.78, 0.66), 0.48, 0.88, 1.05],
		"night": [Color(0.48, 0.62, 1.02), 0.64, 0.58, 1.08],
	}
	var values: Array = settings.get(_time_of_day, settings["noon"])
	var grade_color: Color = values[0]
	var moon := applied_moonlight()
	if _day_material != null and _day_material.shader != null:
		_day_material.set_shader_parameter("grade_color", Vector3(grade_color.r, grade_color.g, grade_color.b))
		_day_material.set_shader_parameter("grade_strength", float(values[1]))
		_day_material.set_shader_parameter("exposure", float(values[2]))
		_day_material.set_shader_parameter("contrast", float(values[3]))
		_day_material.set_shader_parameter("moonlight", moon)
		_day_overlay.color = Color.WHITE
	else:
		_day_overlay.material = null
		_day_overlay.color = Color(grade_color.r, grade_color.g, grade_color.b, float(values[1]) * 0.45)


func _make_overlay(node_name: String) -> ColorRect:
	var overlay := ColorRect.new()
	overlay.name = node_name
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.color = Color.WHITE
	return overlay


func _make_material(path: String) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	var shader := load(path) as Shader
	if shader:
		material.shader = shader
	return material
