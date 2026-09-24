class_name RainDropOverlay
extends Node2D

## Draws real falling drops that land on procedural impact points inside
## user-framed rain regions. The frame itself is never treated as a collision
## edge: targets are scattered through its interior, and drops travel from the
## top of the viewport to those exact targets before optionally splashing.
##
## Every stream emits drops on a jittered interval that is shorter than the
## fall time, so later drops are already in the air before earlier ones land.
## Density controls the number of streams; intensity controls drop size, fall
## speed and how many drops each stream keeps in flight.

var village: VillageSandbox
var director_time := -1.0
var _enabled := false
var _intensity := 0.6
var _density := 0.6
var _wind_enabled := false
var _wind_direction := Vector2.RIGHT
var _wind_strength := 0.0
var _regions: Array[Dictionary] = []
var _targets: Array[Dictionary] = []
# Packed per-stream copies of the _targets fields read every frame; dictionary
# access is too slow for the per-drop loop at high densities.
var _stream_seed := PackedFloat64Array()
var _stream_event_base := PackedFloat64Array()
var _stream_region := PackedInt32Array()
var _stream_splashes := PackedByteArray()
var _depth_batches: Dictionary = {}
const DepthBatch = preload("res://scripts/director/rain_depth_batch.gd")

const SPLASH_DURATION := 0.62
const MAX_STREAMS_PER_REGION := 1280
const POOL_SIZE := 512
const SPEED_JITTER := 0.12
const EMIT_JITTER := 0.9
const OVERLAP_MIN := 1.6
const OVERLAP_MAX := 3.2
const DROP_COLOR := Color(0.86, 0.93, 1.0)
const SPLASH_COLOR := Color(0.72, 0.89, 1.0)
const SPLASH_SEGMENTS := 8


func setup(host: VillageSandbox) -> void:
	village = host
	name = "PairedRainDrops"
	y_sort_enabled = true
	set_process(true)


func apply(model: DirectorSceneModel) -> void:
	for batch in _depth_batches.values():
		batch.free()
	_depth_batches.clear()
	_targets.clear()
	_regions.clear()
	_stream_seed.clear()
	_stream_event_base.clear()
	_stream_region.clear()
	_stream_splashes.clear()
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


## Number of drops a single stream keeps in the air at once.
func drops_in_flight_per_stream() -> float:
	return lerpf(OVERLAP_MIN, OVERLAP_MAX, _intensity)


func fall_tilt_degrees() -> float:
	var direction := _fall_direction()
	return rad_to_deg(atan2(absf(direction.x), maxf(direction.y, 0.0001)))


func first_splash_preview_time() -> float:
	if village == null or village.world == null:
		return 0.0
	var fall_direction := _fall_direction()
	var dir_y := maxf(fall_direction.y, 0.18)
	var base_speed := _base_fall_speed()
	var viewport_size := get_viewport_rect().size
	var interval := _emit_interval(viewport_size, dir_y, base_speed)
	var lookback := _lookback(viewport_size, dir_y, base_speed, interval)
	var canvas_transform := village.world.get_global_transform_with_canvas()
	var best := INF
	for target_data in _targets:
		if not bool(target_data.get("splashes", false)):
			continue
		var seed := float(target_data["seed"])
		var phase := seed * interval * 7.3
		var newest := int(floor(-phase / interval))
		for k in range(newest - lookback, newest + lookback + 1):
			var target: Vector2 = canvas_transform * village.uv_to_world(_target_for_cycle(target_data, k))
			var distance_to_top := (target.y + 54.0) / dir_y
			if distance_to_top <= 1.0:
				continue
			var travel_time := distance_to_top / _drop_speed(base_speed, seed, k)
			var impact_time := _emit_time(phase, interval, seed, k) + travel_time + SPLASH_DURATION * 0.34
			if impact_time >= 0.0 and impact_time < best:
				best = impact_time
		if best < INF:
			return best
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
		var region_seed := float(abs(str(region.get("id", "rain")).hash()) % 100000) * 0.0137
		var pool := PackedVector2Array()
		for attempt in POOL_SIZE * 24:
			if pool.size() >= POOL_SIZE:
				break
			var rx := _hash01(region_seed + float(attempt) * 17.17)
			var ry := _hash01(region_seed + float(attempt) * 31.73 + 9.1)
			var candidate := bounds.position + Vector2(rx * bounds.size.x, ry * bounds.size.y)
			if Geometry2D.is_point_in_polygon(candidate, polygon):
				pool.append(candidate)
		if pool.is_empty():
			continue
		var region_index := _regions.size()
		_regions.append({"pool": pool, "layer": int(region.get("layer", 30))})
		var polygon_area := absf(_signed_area(polygon))
		# Low densities stay close to the previous look; the top of the slider
		# is at least ten times the previous maximum (128 streams per region).
		var per_area := 150.0 + 9000.0 * pow(_density, 4.0)
		var desired := clampi(int(round(polygon_area * per_area)), 2, MAX_STREAMS_PER_REGION)
		var splashes := bool(region.get("splashes_enabled", true))
		for slot in desired:
			var seed := _hash01(region_seed + float(slot) * 7.91 + 3.7)
			_targets.append({
				"uv": pool[slot % pool.size()],
				"region": region_index,
				"region_seed": region_seed,
				"slot": slot,
				"splashes": splashes,
				"seed": seed,
			})
			_stream_seed.append(seed)
			_stream_event_base.append(region_seed + float(slot) * 47.11)
			_stream_region.append(region_index)
			_stream_splashes.append(1 if splashes else 0)


func _process(_delta: float) -> void:
	for batch in _depth_batches.values():
		batch.clear_marks()
	if not _enabled or village == null or village.world == null or _targets.is_empty():
		return
	var viewport_size := get_viewport_rect().size
	if viewport_size.x <= 1.0 or viewport_size.y <= 1.0:
		return
	var clock := director_time if director_time >= 0.0 else float(Time.get_ticks_msec()) / 1000.0
	var fall_direction := _fall_direction()
	var dir_y := maxf(fall_direction.y, 0.18)
	var base_speed := _base_fall_speed()
	var interval := _emit_interval(viewport_size, dir_y, base_speed)
	var lookback := _lookback(viewport_size, dir_y, base_speed, interval)
	var canvas_transform := village.world.get_global_transform_with_canvas()
	var screen_pools: Array[PackedVector2Array] = []
	for region_data in _regions:
		var pool: PackedVector2Array = region_data["pool"]
		var screen := PackedVector2Array()
		screen.resize(pool.size())
		for i in pool.size():
			screen[i] = canvas_transform * village.uv_to_world(pool[i])
		screen_pools.append(screen)
	var intensity_scale := lerpf(0.78, 1.22, _intensity)
	var tail_base := lerpf(26.0, 62.0, _intensity)
	var cull_min := Vector2(-180.0, -80.0)
	var cull_max := viewport_size + Vector2(180.0, 120.0)
	var splash_alpha := lerpf(0.58, 0.94, _intensity)
	var max_life := _longest_travel(viewport_size, dir_y, base_speed) / (1.0 - SPEED_JITTER) + SPLASH_DURATION
	# The hashes below are inlined copies of _emit_time, _pool_index and
	# _drop_speed; function calls dominate the frame cost at high densities.
	for s in _stream_seed.size():
		var seed := _stream_seed[s]
		var event_base := _stream_event_base[s]
		var screen: PackedVector2Array = screen_pools[_stream_region[s]]
		var pool_size := screen.size()
		var splash_life := SPLASH_DURATION if _stream_splashes[s] == 1 else 0.0
		var phase := seed * interval * 7.3
		var newest := int(floor((clock - phase) / interval))
		for k in range(newest - lookback, newest + 1):
			var fk := float(k)
			var h := sin((seed * 53.7 + fk * 7.31) * 12.9898) * 43758.5453
			h -= floor(h)
			var age := clock - (phase + (fk + h * EMIT_JITTER) * interval)
			if age < 0.0 or age >= max_life:
				continue
			h = sin((event_base + fk * 101.73) * 12.9898) * 43758.5453
			h -= floor(h)
			var target_index := mini(int(h * float(pool_size)), pool_size - 1)
			var target := screen[target_index]
			if target.x < cull_min.x or target.x > cull_max.x or target.y < cull_min.y or target.y > cull_max.y:
				continue
			var distance_to_top := (target.y + 54.0) / dir_y
			if distance_to_top <= 1.0:
				continue
			h = sin((seed * 91.1 + fk * 13.7) * 12.9898) * 43758.5453
			h -= floor(h)
			var speed := base_speed * lerpf(1.0 - SPEED_JITTER, 1.0 + SPEED_JITTER, h)
			var travel_time := distance_to_top / speed
			if age >= travel_time + splash_life:
				continue
			var size_random := sin((seed * 71.3 + fk * 23.17) * 12.9898) * 43758.5453
			size_random -= floor(size_random)
			var scale := lerpf(0.62, 1.42, size_random) * intensity_scale
			var region_index := _stream_region[s]
			var batch_key := region_index * POOL_SIZE + target_index
			var batch: Node2D = _depth_batches.get(batch_key)
			if batch == null:
				batch = DepthBatch.new()
				batch.position = village.uv_to_world(_regions[region_index]["pool"][target_index])
				batch.z_index = int(_regions[region_index]["layer"])
				add_child(batch)
				_depth_batches[batch_key] = batch
			if age < travel_time:
				var travelled := age * speed
				var head := target - fall_direction * (distance_to_top - travelled)
				var tail_length := minf(tail_base * scale, travelled)
				var tail := head - fall_direction * tail_length
				batch.add_streak(tail, head, Color(DROP_COLOR, lerpf(0.44, 0.78, _intensity)), clampf(0.85 * scale, 0.52, 1.55))
			else:
				var splash_age := clampf((age - travel_time) / SPLASH_DURATION, 0.0, 1.0)
				batch.add_splash(target, splash_age, scale, splash_alpha)

func _base_fall_speed() -> float:
	return lerpf(520.0, 1120.0, _intensity) * clampf(1.0 + _wind_direction.y * _wind_strength * 0.18, 0.78, 1.20)


func _longest_travel(viewport_size: Vector2, dir_y: float, base_speed: float) -> float:
	return (viewport_size.y + 174.0) / dir_y / maxf(base_speed, 1.0)


func _emit_interval(viewport_size: Vector2, dir_y: float, base_speed: float) -> float:
	return maxf(_longest_travel(viewport_size, dir_y, base_speed) / drops_in_flight_per_stream(), 0.02)


func _lookback(viewport_size: Vector2, dir_y: float, base_speed: float, interval: float) -> int:
	var max_life := _longest_travel(viewport_size, dir_y, base_speed) / (1.0 - SPEED_JITTER) + SPLASH_DURATION
	return int(ceil(max_life / interval)) + 1


func _emit_time(phase: float, interval: float, seed: float, k: int) -> float:
	# Each emission is shifted by up to 90% of an interval so neighbouring
	# streams never lock into synchronised waves.
	return phase + (float(k) + _hash01(seed * 53.7 + float(k) * 7.31) * EMIT_JITTER) * interval


func _drop_speed(base_speed: float, seed: float, k: int) -> float:
	return base_speed * lerpf(1.0 - SPEED_JITTER, 1.0 + SPEED_JITTER, _hash01(seed * 91.1 + float(k) * 13.7))


func _pool_index(target_data: Dictionary, cycle_index: int, pool_size: int) -> int:
	var event_seed := float(target_data["region_seed"]) + float(target_data["slot"]) * 47.11 + float(cycle_index) * 101.73
	return mini(int(_hash01(event_seed) * float(pool_size)), pool_size - 1)


func _fall_direction() -> Vector2:
	# Wind strength maps linearly to an angle from vertical. Horizontal and
	# diagonal winds reach 60 degrees at full strength; pure vertical wind keeps
	# the rain vertical and only changes its fall speed.
	if not _wind_enabled or _wind_strength <= 0.0001 or absf(_wind_direction.x) <= 0.0001:
		return Vector2.DOWN
	var tilt_radians := deg_to_rad(60.0 * _wind_strength)
	return Vector2(signf(_wind_direction.x) * sin(tilt_radians), cos(tilt_radians)).normalized()


func _target_for_cycle(target_data: Dictionary, cycle_index: int) -> Vector2:
	var pool: PackedVector2Array = _regions[int(target_data["region"])]["pool"]
	return pool[_pool_index(target_data, cycle_index, pool.size())]


func _signed_area(points: PackedVector2Array) -> float:
	var result := 0.0
	for i in points.size():
		var a := points[i]
		var b := points[(i + 1) % points.size()]
		result += a.x * b.y - b.x * a.y
	return result * 0.5


func _hash01(value: float) -> float:
	return fposmod(sin(value * 12.9898) * 43758.5453, 1.0)
