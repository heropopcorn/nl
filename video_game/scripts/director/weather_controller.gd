class_name WeatherController
extends CanvasLayer

## Screen-space time-of-day grading and full-screen falling rain. World-space
## rain regions only define the impact surface and optional splash response.

const RAIN_SHADER_PATH := "res://shaders/rain.gdshader"
const DAY_SHADER_PATH := "res://shaders/day_cycle.gdshader"
const WIND_SHADER_PATH := "res://shaders/wind.gdshader"
const LIGHTNING_SHADER_PATH := "res://shaders/lightning.gdshader"

var _day_overlay: ColorRect
var _day_material: ShaderMaterial
var _rain_overlay: ColorRect
var _rain_material: ShaderMaterial
var _wind_overlay: ColorRect
var _wind_material: ShaderMaterial
var _lightning_overlay: ColorRect
var _lightning_material: ShaderMaterial
var _enabled := false
var _intensity := 0.6
var _time_of_day := "noon"
var _moonlight_enabled := true
var _moonlight_intensity := 0.65
var _lightning_enabled := false
var _lightning_intensity := 0.75
var _lightning_frequency := 0.35
var _wind_enabled := false
var _wind_direction := Vector2.RIGHT
var _wind_strength := 0.45
var _lightning_flash := 0.0
var _paused := false
var _director_time := -1.0


func setup() -> void:
	name = "WeatherCanvas"
	layer = 16
	follow_viewport_enabled = false
	_day_overlay = _make_overlay("DayCycleOverlay")
	_day_material = _make_material(DAY_SHADER_PATH)
	if _day_material.shader:
		_day_overlay.material = _day_material
	add_child(_day_overlay)
	_wind_overlay = _make_overlay("WindOverlay")
	_wind_material = _make_material(WIND_SHADER_PATH)
	if _wind_material.shader:
		_wind_overlay.material = _wind_material
	add_child(_wind_overlay)
	_rain_overlay = _make_overlay("RainOverlay")
	_rain_material = _make_material(RAIN_SHADER_PATH)
	if _rain_material.shader:
		_rain_overlay.material = _rain_material
	add_child(_rain_overlay)
	_lightning_overlay = _make_overlay("LightningOverlay")
	_lightning_material = _make_material(LIGHTNING_SHADER_PATH)
	if _lightning_material.shader:
		_lightning_overlay.material = _lightning_material
	add_child(_lightning_overlay)
	set_process(true)
	_refresh()


func apply(model: DirectorSceneModel) -> void:
	if model == null:
		_enabled = false
		_time_of_day = "noon"
		_moonlight_enabled = false
		_lightning_enabled = false
		_wind_enabled = false
		_refresh()
		return
	_enabled = bool(model.weather.get("enabled", false)) and str(model.weather.get("type", "rain")) == "rain"
	_intensity = clampf(float(model.weather.get("intensity", 0.6)), 0.0, 1.0)
	_time_of_day = str(model.weather.get("time_of_day", "noon"))
	_moonlight_enabled = bool(model.weather.get("moonlight_enabled", true))
	_moonlight_intensity = clampf(float(model.weather.get("moonlight_intensity", 0.65)), 0.0, 1.0)
	_lightning_enabled = bool(model.weather.get("lightning_enabled", false))
	_lightning_intensity = clampf(float(model.weather.get("lightning_intensity", 0.75)), 0.0, 1.0)
	_lightning_frequency = clampf(float(model.weather.get("lightning_frequency", 0.35)), 0.0, 1.0)
	_wind_enabled = bool(model.weather.get("wind_enabled", false))
	_wind_direction = DirectorSceneModel._vec2(model.weather.get("wind_direction", [1, 0]), Vector2.RIGHT)
	if _wind_direction.length_squared() < 0.000001:
		_wind_direction = Vector2.RIGHT
	_wind_direction = _wind_direction.normalized()
	_wind_strength = clampf(float(model.weather.get("wind_strength", 0.45)), 0.0, 1.0)
	_refresh()


func set_paused(paused: bool) -> void:
	_paused = paused
	_refresh()


func set_director_time(value: float) -> void:
	_director_time = value
	if _uses_rain_shader():
		_rain_material.set_shader_parameter("director_time", _director_time)
	if _wind_material and _wind_material.shader:
		_wind_material.set_shader_parameter("director_time", _director_time)
	_apply_dynamic_effects()


func is_raining() -> bool:
	return _enabled


func has_visible_effect() -> bool:
	return _enabled and _rain_overlay != null and _rain_overlay.visible and _intensity > 0.0 and (
		_uses_rain_shader() or _rain_overlay.color.a > 0.0
	)


func applied_intensity() -> float:
	if _uses_rain_shader():
		return float(_rain_material.get_shader_parameter("intensity"))
	return _intensity if _enabled else 0.0


func applied_time_of_day() -> String:
	return _time_of_day


func applied_moonlight() -> float:
	return _moonlight_intensity if _time_of_day == "night" and _moonlight_enabled else 0.0


func material_moonlight() -> float:
	if _day_material == null or _day_material.shader == null:
		return 0.0
	return float(_day_material.get_shader_parameter("moonlight"))


func applied_wind_direction() -> Vector2:
	return _wind_direction


func applied_wind_strength() -> float:
	return _wind_strength if _wind_enabled else 0.0


func rain_material_wind_strength() -> float:
	if not _uses_rain_shader():
		return 0.0
	return float(_rain_material.get_shader_parameter("wind_strength"))


func lightning_flash_amount() -> float:
	return _lightning_flash


func has_wind_effect() -> bool:
	return _wind_overlay != null and _wind_overlay.visible


func _process(_delta: float) -> void:
	_layout_overlays()
	_apply_dynamic_effects()


func _refresh() -> void:
	if _rain_overlay == null or _day_overlay == null or _wind_overlay == null or _lightning_overlay == null:
		return
	var show := _enabled
	_rain_overlay.visible = show and _intensity > 0.0
	_wind_overlay.visible = _wind_enabled and _wind_strength > 0.0
	_lightning_overlay.visible = false
	_day_overlay.visible = _time_of_day != "noon" or (_time_of_day == "night" and _moonlight_enabled)
	_layout_overlays()
	_apply_day_grade()
	if _uses_rain_shader():
		var clock := _director_time
		if _paused and clock < 0.0:
			clock = 0.0
		_rain_material.set_shader_parameter("intensity", _intensity if show else 0.0)
		_rain_material.set_shader_parameter("director_time", clock)
		_rain_material.set_shader_parameter("wind_direction", _wind_direction)
		_rain_material.set_shader_parameter("wind_strength", _wind_strength if _wind_enabled else 0.0)
		_rain_overlay.color = Color.WHITE
	else:
		_rain_overlay.material = null
		_rain_overlay.color = Color(0.32, 0.42, 0.58, 0.62 * _intensity if show else 0.0)
	if _wind_material and _wind_material.shader:
		_wind_material.set_shader_parameter("strength", _wind_strength if _wind_enabled else 0.0)
		_wind_material.set_shader_parameter("wind_direction", _wind_direction)
		_wind_material.set_shader_parameter("director_time", _director_time)
		_wind_overlay.color = Color.WHITE
	else:
		_wind_overlay.material = null
		_wind_overlay.color = Color.TRANSPARENT
	_apply_dynamic_effects()


func _layout_overlays() -> void:
	var vp := get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	# CanvasLayer has no Control parent. Explicit pixel sizing avoids a zero-size
	# full-rect on Compatibility/Web renderers.
	for overlay in [_day_overlay, _wind_overlay, _rain_overlay, _lightning_overlay]:
		if overlay:
			overlay.set_anchors_preset(Control.PRESET_TOP_LEFT)
			overlay.position = Vector2.ZERO
			overlay.size = vp
	if _uses_rain_shader():
		_rain_material.set_shader_parameter("viewport_size", vp)
	if _wind_material and _wind_material.shader:
		_wind_material.set_shader_parameter("viewport_size", vp)
	if _lightning_material and _lightning_material.shader:
		_lightning_material.set_shader_parameter("viewport_size", vp)


func _apply_dynamic_effects() -> void:
	if _lightning_overlay == null:
		return
	var active := _enabled and _lightning_enabled and _lightning_intensity > 0.0
	_lightning_flash = _lightning_envelope(_director_time) * _lightning_intensity if active else 0.0
	_lightning_overlay.visible = _lightning_flash > 0.003
	if _lightning_material and _lightning_material.shader:
		var interval := lerpf(14.0, 3.0, _lightning_frequency)
		var event_index: float = floorf(maxf(_director_time, 0.0) / interval)
		_lightning_material.set_shader_parameter("flash", _lightning_flash)
		_lightning_material.set_shader_parameter("bolt_seed", event_index + 1.0)
		_lightning_overlay.color = Color.WHITE
	else:
		_lightning_overlay.material = null
		_lightning_overlay.color = Color(0.72, 0.84, 1.0, _lightning_flash * 0.55)


func _lightning_envelope(time_value: float) -> float:
	var interval := lerpf(14.0, 3.0, _lightning_frequency)
	var safe_time := maxf(time_value, 0.0)
	var event_index := floorf(safe_time / interval)
	var local_time := fposmod(safe_time, interval)
	var random_offset := 0.0 if event_index <= 0.0 else _hash01(event_index * 19.73) * interval * 0.52
	var phase := local_time - random_offset
	if phase < 0.0:
		return 0.0
	var first := exp(-phase * 18.0)
	var second := exp(-absf(phase - 0.18) * 34.0) * 0.72
	return clampf(maxf(first, second), 0.0, 1.0)


func _hash01(value: float) -> float:
	return fposmod(sin(value * 12.9898) * 43758.5453, 1.0)


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


func _uses_rain_shader() -> bool:
	return _rain_material != null and _rain_material.shader != null
