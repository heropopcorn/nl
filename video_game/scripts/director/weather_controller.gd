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
	layer = 16
	follow_viewport_enabled = false
	_dim = ColorRect.new()
	_dim.name = "RainDim"
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dim.color = Color(0.04, 0.07, 0.12, 0.0)
	add_child(_dim)

	_rain = CPUParticles2D.new()
	_rain.name = "RainParticles"
	_rain.emitting = false
	_rain.local_coords = true
	_rain.direction = Vector2(0.12, 1)
	_rain.spread = 12.0
	_rain.gravity = Vector2(40, 1100)
	_rain.initial_velocity_min = 380.0
	_rain.initial_velocity_max = 720.0
	_rain.lifetime = 1.1
	_rain.explosiveness = 0.0
	_rain.randomness = 0.35
	_rain.texture = _streak_texture()
	_rain.scale_amount_min = 0.8
	_rain.scale_amount_max = 1.6
	add_child(_rain)
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


func is_raining() -> bool:
	return _enabled


func _process(_delta: float) -> void:
	if _enabled:
		_layout_particles()


func _refresh() -> void:
	if _dim == null or _rain == null:
		return
	var show := _enabled
	_dim.visible = show
	_dim.color = Color(0.05, 0.08, 0.14, 0.38 * _intensity if show else 0.0)
	_layout_particles()
	var want_amount := clampi(int(lerp(90, 520, _intensity)), 60, 520)
	if _rain.amount != want_amount:
		_rain.amount = want_amount
	_rain.emitting = show and not _paused
	_rain.speed_scale = 0.0 if _paused else 1.0
	_rain.visible = show


func _layout_particles() -> void:
	var vp := get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	_dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_rain.position = Vector2(vp.x * 0.5, -24.0)
	_rain.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_rain.emission_rect_extents = Vector2(vp.x * 0.6, 12.0)


func _streak_texture() -> ImageTexture:
	var image := Image.create(3, 18, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.82, 0.88, 1.0, 0.82))
	return ImageTexture.create_from_image(image)
