class_name WeatherController
extends CanvasLayer

## Screen-space rain. Cost is viewport-sized, not map-sized.

const SHADER_PATH := "res://shaders/rain.gdshader"

var _overlay: ColorRect
var _material: ShaderMaterial
var _enabled := false
var _intensity := 0.6
var _paused := false
var _director_time := -1.0


func setup() -> void:
	name = "WeatherCanvas"
	layer = 16
	follow_viewport_enabled = false
	_overlay = ColorRect.new()
	_overlay.name = "RainOverlay"
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.color = Color(1, 1, 1, 1)
	_material = ShaderMaterial.new()
	var shader := load(SHADER_PATH) as Shader
	if shader:
		_material.shader = shader
		_overlay.material = _material
	add_child(_overlay)
	set_process(true)
	_refresh()


func apply(model: DirectorSceneModel) -> void:
	if model == null:
		_enabled = false
		_refresh()
		return
	_enabled = bool(model.weather.get("enabled", false)) and str(model.weather.get("type", "rain")) == "rain"
	_intensity = clampf(float(model.weather.get("intensity", 0.6)), 0.0, 1.0)
	_refresh()


func set_paused(paused: bool) -> void:
	_paused = paused
	_refresh()


func set_director_time(value: float) -> void:
	_director_time = value
	if _uses_shader():
		_material.set_shader_parameter("director_time", _director_time)


func is_raining() -> bool:
	return _enabled


func has_visible_effect() -> bool:
	return _enabled and _overlay != null and _overlay.visible and _intensity > 0.0 and (
		_uses_shader() or _overlay.color.a > 0.0
	)


func applied_intensity() -> float:
	if _uses_shader():
		return float(_material.get_shader_parameter("intensity"))
	return _intensity if _enabled else 0.0


func _process(_delta: float) -> void:
	if _enabled:
		_layout_overlay()


func _refresh() -> void:
	if _overlay == null:
		return
	var show := _enabled
	_overlay.visible = show
	_layout_overlay()
	if _uses_shader():
		var clock := _director_time
		if _paused and clock < 0.0:
			clock = 0.0
		_material.set_shader_parameter("intensity", _intensity if show else 0.0)
		_material.set_shader_parameter("director_time", clock)
		_overlay.color = Color(1, 1, 1, 1)
	else:
		_overlay.material = null
		_overlay.color = Color(0.05, 0.08, 0.14, 0.42 * _intensity if show else 0.0)


func _layout_overlay() -> void:
	var vp := get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if _uses_shader():
		_material.set_shader_parameter("viewport_size", vp)


func _uses_shader() -> bool:
	return _material != null and _material.shader != null
