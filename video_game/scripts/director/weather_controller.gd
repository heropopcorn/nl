class_name WeatherController
extends CanvasLayer

## Screen-space rain. Cost is viewport-sized, not map-sized.

var _dim: ColorRect
var _rain: CPUParticles2D
var _enabled := false
var _intensity := 0.6
var _paused := false


func setup() -> void:
	name = "WeatherCanvas"
	layer = 8
	follow_viewport_enabled = false
	_dim = ColorRect.new()
	_dim.name = "RainDim"
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dim.anchor_right = 1.0
	_dim.anchor_bottom = 1.0
	_dim.color = Color(0.04, 0.07, 0.12, 0.0)
	add_child(_dim)

	_rain = CPUParticles2D.new()
	_rain.name = "RainParticles"
	_rain.emitting = false
	_rain.local_coords = false
	_rain.direction = Vector2(0.12, 1)
	_rain.spread = 8.0
	_rain.gravity = Vector2(0, 980)
	_rain.initial_velocity_min = 420.0
	_rain.initial_velocity_max = 640.0
	_rain.lifetime = 0.9
	_rain.explosiveness = 0.0
	_rain.randomness = 0.3
	_rain.texture = _streak_texture()
	add_child(_rain)
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


func is_raining() -> bool:
	return _enabled


func _refresh() -> void:
	if _dim == null or _rain == null:
		return
	var show := _enabled
	_dim.visible = show
	_dim.color = Color(0.04, 0.07, 0.12, 0.22 * _intensity if show else 0.0)
	_rain.emitting = show and not _paused
	_rain.speed_scale = 0.0 if _paused else 1.0
	_rain.amount = clampi(int(lerp(70, 420, _intensity)), 40, 420)
	var vp := get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	_rain.position = Vector2(vp.x * 0.5, -20.0)
	_rain.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_rain.emission_rect_extents = Vector2(vp.x * 0.55, 8.0)


func _streak_texture() -> ImageTexture:
	var image := Image.create(2, 10, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.75, 0.82, 0.95, 0.65))
	return ImageTexture.create_from_image(image)
