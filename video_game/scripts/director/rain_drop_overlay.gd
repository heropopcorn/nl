class_name RainDropOverlay
extends Node2D

## Draws one real falling drop for every procedural impact point inside a
## user-framed rain region. The frame itself is never treated as a collision
## edge: targets are scattered through its interior, and drops travel from the
## top of the viewport to those exact targets before optionally splashing.

var village: VillageSandbox
var director_time := -1.0
var _enabled := false
var _intensity := 0.6
var _density := 0.6
var _wind_enabled := false
var _wind_direction := Vector2.RIGHT
var _wind_strength := 0.0
var _targets: Array[Dictionary] = []

const SPLASH_DURATION := 0.62
const SILENT_IMPACT_DURATION := 0.08
const REST_TIME_MIN := 0.08
const REST_TIME_MAX := 0.24


func setup(host: VillageSandbox) -> void:
	village = host
	name = "PairedRainDrops"
	set_process(false)


func apply(model: DirectorSceneModel) -> void:
	_targets.clear()
	if model == null:
		_enabled = false
		visible = false
		queue_redraw()
		return
	_enabled = bool(model.weather.get("enabled", false)) and str(model.weather.get("type", "rain")) == "rain"
	_intensity = clampf(float(model.weather.get("intensity", 0.6)), 0.0, 1.0)
	_density = clampf(float(model.weather.get("rain_density", 0.6)), 0.0, 1.0)
	_wind_enabled = bool(model.weather.get("wind_enabled", false))
	_wind_direction = DirectorSceneModel._vec2(model.weather.get("wind_direction", [1, 0]), Vector2.RIGHT)
	if _wind_direction.length_squared() < 0.000001:
		_wind_direction = Vector2.RIGHT
	_wind_direction = _wind_direction.normalized()
	_wind_strength = clampf(float(model.weather.get("wind_strength", 0.45)), 0.0, 1.0) if _wind_enabled else 0.0
	if _enabled and _intensity > 0.0 and _density > 0.0:
		_build_targets(model)
	visible = _enabled and not _targets.is_empty()
	queue_redraw()


func set_director_time(value: float) -> void:
	director_time = value
	queue_redraw()


func target_count() -> int:
	return _targets.size()


func splash_target_count() -> int:
	return _targets.filter(func(target: Dictionary) -> bool: return bool(target.get("splashes", false))).size()


func silent_target_count() -> int:
	return _targets.filter(func(target: Dictionary) -> bool: return not bool(target.get("splashes", true))).size()


func target_vertical_span() -> float:
	if _targets.size() < 2:
		return 0.0
	var top := INF
	var bottom := -INF
	for target in _targets:
		var uv: Vector2 = target["uv"]
		top = minf(top, uv.y)
		bottom = maxf(bottom, uv.y)
	return bottom - top


func target_cycle_shift() -> float:
	if _targets.is_empty():
		return 0.0
	var target_data := _targets[0]
	return _target_for_cycle(target_data, 1).distance_to(_target_for_cycle(target_data, 2))


func fall_tilt_degrees() -> float:
	var direction := _fall_direction()
	return rad_to_deg(atan2(absf(direction.x), maxf(direction.y, 0.0001)))


func first_splash_preview_time() -> float:
	if village == null or village.world == null:
		return 0.0
	var wind := _wind_direction * _wind_strength
	var fall_direction := _fall_direction()
	var fall_speed := lerpf(520.0, 1120.0, _intensity) * clampf(1.0 + wind.y * 0.18, 0.78, 1.20)
	var canvas_transform := village.world.get_global_transform_with_canvas()
	var viewport_size := get_viewport_rect().size
	for target_data in _targets:
		if not bool(target_data.get("splashes", false)):
			continue
		var seed := float(target_data["seed"])
		var splash_duration := SPLASH_DURATION
		var cycle_duration := _cycle_duration(viewport_size, fall_direction, fall_speed, splash_duration, seed)
		var phase_offset := seed * cycle_duration * 3.7
		var first_cycle := int(floor(phase_offset / cycle_duration))
		for cycle_index in [first_cycle, first_cycle + 1]:
			var target_uv := _target_for_cycle(target_data, cycle_index)
			var target: Vector2 = canvas_transform * village.uv_to_world(target_uv)
			var distance_to_top := (target.y + 54.0) / maxf(fall_direction.y, 0.18)
			var travel_time := maxf(distance_to_top, 1.0) / fall_speed
			var desired_local_time := travel_time + splash_duration * 0.34
			var preview_time := float(cycle_index) * cycle_duration + desired_local_time - phase_offset
			if preview_time >= 0.0 and preview_time < cycle_duration:
				return preview_time
	return 0.0


func _build_targets(model: DirectorSceneModel) -> void:
	for region in model.rain_regions:
		if not bool(region.get("enabled", true)):
			continue
		var polygon := DirectorSceneModel.points_from_value(region.get("points_uv", []))
		if polygon.size() < 3:
			continue
		var bounds := DirectorSceneModel.polygon_bounds(polygon)
		if bounds.size.x <= 0.0001 or bounds.size.y <= 0.0001:
			continue
		var polygon_area := absf(_signed_area(polygon))
		# Keep impact points dense enough that the rain reads as ground contact,
		# not as a foreground veil. Density controls event count independently of
		# intensity, while every generated point still owns exactly one drop.
		var desired := clampi(int(round(polygon_area * lerpf(180.0, 1800.0, _density))), 2, 128)
		var region_seed := float(abs(str(region.get("id", "rain")).hash()) % 100000) * 0.0137
		var added := 0
		for attempt in desired * 24:
			if added >= desired:
				break
			var rx := _hash01(region_seed + float(attempt) * 17.17)
			var ry := _hash01(region_seed + float(attempt) * 31.73 + 9.1)
			var candidate := bounds.position + Vector2(rx * bounds.size.x, ry * bounds.size.y)
			if not Geometry2D.is_point_in_polygon(candidate, polygon):
				continue
			_targets.append({
				"uv": candidate,
				"polygon": polygon.duplicate(),
				"bounds": bounds,
				"region_seed": region_seed,
				"slot": added,
				"splashes": bool(region.get("splashes_enabled", true)),
				"seed": _hash01(region_seed + float(attempt) * 7.91 + 3.7),
			})
			added += 1


func _draw() -> void:
	if not _enabled or village == null or village.world == null or _targets.is_empty():
		return
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 1.0 or viewport_size.y <= 1.0:
		return
	var clock := director_time if director_time >= 0.0 else float(Time.get_ticks_msec()) / 1000.0
	var wind := _wind_direction * _wind_strength
	var fall_direction := _fall_direction()
	var fall_speed := lerpf(520.0, 1120.0, _intensity) * clampf(1.0 + wind.y * 0.18, 0.78, 1.20)
	var canvas_transform := village.world.get_global_transform_with_canvas()
	for target_data in _targets:
		var seed := float(target_data["seed"])
		var splash_duration := SPLASH_DURATION if bool(target_data["splashes"]) else SILENT_IMPACT_DURATION
		var cycle_duration := _cycle_duration(viewport_size, fall_direction, fall_speed, splash_duration, seed)
		var event_time := clock + seed * cycle_duration * 3.7
		var cycle_index := int(floor(event_time / cycle_duration))
		var local_time := fposmod(event_time, cycle_duration)
		# A new deterministic target is chosen for every cycle. This remains stable
		# while a drop is falling, but never repeats the same obvious rain pattern.
		var target_uv := _target_for_cycle(target_data, cycle_index)
		var target: Vector2 = canvas_transform * village.uv_to_world(target_uv)
		if target.x < -180.0 or target.x > viewport_size.x + 180.0 or target.y < -80.0 or target.y > viewport_size.y + 120.0:
			continue
		var distance_to_top := (target.y + 54.0) / maxf(fall_direction.y, 0.18)
		if distance_to_top <= 1.0:
			continue
		var start := target - fall_direction * distance_to_top
		var travel_time := distance_to_top / fall_speed
		var size_random := _hash01(seed * 71.3 + float(cycle_index) * 23.17)
		var scale := lerpf(0.62, 1.42, size_random) * lerpf(0.78, 1.22, _intensity)
		if local_time < travel_time:
			var travelled := minf(local_time * fall_speed, distance_to_top)
			var head := start + fall_direction * travelled
			var tail_length := minf(lerpf(26.0, 62.0, _intensity) * scale, travelled)
			var tail := head - fall_direction * tail_length
			var alpha := lerpf(0.44, 0.78, _intensity)
			var drop_width := clampf(0.85 * scale, 0.52, 1.55)
			draw_line(tail, head, Color(0.86, 0.93, 1.0, alpha), drop_width, true)
		elif bool(target_data["splashes"]) and local_time < travel_time + splash_duration:
			var age := clampf((local_time - travel_time) / splash_duration, 0.0, 1.0)
			_draw_splash(target, age, scale)


func _cycle_duration(viewport_size: Vector2, fall_direction: Vector2, fall_speed: float, splash_duration: float, seed: float) -> float:
	var longest_distance := (viewport_size.y + 174.0) / maxf(fall_direction.y, 0.18)
	var longest_travel := longest_distance / maxf(fall_speed, 1.0)
	return longest_travel + splash_duration + lerpf(REST_TIME_MIN, REST_TIME_MAX, seed)


func _fall_direction() -> Vector2:
	# Wind strength maps linearly to an angle from vertical. Horizontal and
	# diagonal winds reach 60 degrees at full strength; pure vertical wind keeps
	# the rain vertical and only changes its fall speed.
	if not _wind_enabled or _wind_strength <= 0.0001 or absf(_wind_direction.x) <= 0.0001:
		return Vector2.DOWN
	var tilt_radians := deg_to_rad(60.0 * _wind_strength)
	return Vector2(signf(_wind_direction.x) * sin(tilt_radians), cos(tilt_radians)).normalized()


func _target_for_cycle(target_data: Dictionary, cycle_index: int) -> Vector2:
	var polygon: PackedVector2Array = target_data["polygon"]
	var bounds: Rect2 = target_data["bounds"]
	var event_seed := float(target_data["region_seed"]) + float(target_data["slot"]) * 47.11 + float(cycle_index) * 101.73
	for attempt in 48:
		var rx := _hash01(event_seed + float(attempt) * 17.17)
		var ry := _hash01(event_seed + float(attempt) * 31.73 + 9.1)
		var candidate := bounds.position + Vector2(rx * bounds.size.x, ry * bounds.size.y)
		if Geometry2D.is_point_in_polygon(candidate, polygon):
			return candidate
	return target_data["uv"]


func _draw_splash(center: Vector2, age: float, scale: float) -> void:
	var fade := 1.0 - smoothstep(0.62, 1.0, age)
	var color := Color(0.72, 0.89, 1.0, fade * lerpf(0.58, 0.94, _intensity))
	if age < 0.20:
		draw_circle(center, lerpf(2.6, 1.2, age / 0.20) * scale, color)
	var radius := lerpf(2.0, 17.0, age) * scale
	var points := PackedVector2Array()
	for i in 19:
		var angle := lerpf(0.0, TAU, float(i) / 18.0)
		points.append(center + Vector2(cos(angle) * radius, sin(angle) * radius * 0.28))
	var splash_width := clampf(0.95 * scale, 0.62, 1.65)
	draw_polyline(points, color, splash_width, true)
	var crown_height := sin(age * PI) * 16.0 * scale
	var spread := lerpf(3.0, 13.0, age) * scale
	draw_line(center + Vector2(-2.0, 0.0), center + Vector2(-spread, -crown_height), color, splash_width, true)
	draw_line(center + Vector2(2.0, 0.0), center + Vector2(spread, -crown_height * 0.88), color, splash_width, true)


func _signed_area(points: PackedVector2Array) -> float:
	var result := 0.0
	for i in points.size():
		var a := points[i]
		var b := points[(i + 1) % points.size()]
		result += a.x * b.y - b.x * a.y
	return result * 0.5


func _hash01(value: float) -> float:
	return fposmod(sin(value * 12.9898) * 43758.5453, 1.0)
