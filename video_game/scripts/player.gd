extends CharacterBody2D

const WALK_SPEED := 210.0
const SPRINT_SPEED := 320.0

@onready var sprite: Sprite2D = $Sprite2D

var control_enabled := true
var _base_offset := Vector2.ZERO
var _path_playing := false
var _path_loop := false
var _path_world: PackedVector2Array = PackedVector2Array()
var _path_seg := 0
var _saved_collision_mask := 1


func _ready() -> void:
	_ensure_move_actions()
	motion_mode = MOTION_MODE_FLOATING
	_base_offset = sprite.offset
	_saved_collision_mask = collision_mask


func is_playing_path() -> bool:
	return _path_playing


func play_path(points: PackedVector2Array, loop: bool, ignore_collision: bool) -> bool:
	if points.size() < 2:
		return false
	stop_path()
	_path_world = points.duplicate()
	_path_loop = loop
	_path_seg = 0
	_path_playing = true
	_saved_collision_mask = collision_mask
	if ignore_collision:
		collision_mask = 0
	global_position = _path_world[0]
	velocity = Vector2.ZERO
	return true


func stop_path() -> void:
	if not _path_playing:
		return
	_path_playing = false
	collision_mask = _saved_collision_mask
	velocity = Vector2.ZERO
	_rest_sprite()


func _physics_process(delta: float) -> void:
	if _path_playing:
		if control_enabled:
			var cancel := Input.get_vector("move_left", "move_right", "move_up", "move_down")
			if cancel.length() > 0.15:
				stop_path()
			else:
				_follow_path(delta)
				return
		else:
			_follow_path(delta)
			return
	if not control_enabled:
		velocity = Vector2.ZERO
		move_and_slide()
		_rest_sprite()
		return
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var speed := SPRINT_SPEED if Input.is_key_pressed(KEY_SHIFT) else WALK_SPEED
	velocity = direction * speed
	move_and_slide()
	_animate_walk(direction)


func _follow_path(delta: float) -> void:
	if _path_seg >= _path_world.size() - 1:
		if _path_loop:
			_path_seg = 0
			global_position = _path_world[0]
		else:
			stop_path()
			return
	var target: Vector2 = _path_world[_path_seg + 1]
	var to_target := target - global_position
	var distance := to_target.length()
	var step := WALK_SPEED * delta
	var direction := to_target / distance if distance > 0.001 else Vector2.ZERO
	if distance <= step:
		global_position = target
		velocity = Vector2.ZERO
		_path_seg += 1
		_animate_walk(direction)
		return
	velocity = direction * WALK_SPEED
	move_and_slide()
	_animate_walk(direction)


func _animate_walk(direction: Vector2) -> void:
	if direction.length() > 0.1:
		sprite.offset.y = _base_offset.y + sin(Time.get_ticks_msec() * 0.014) * 3.0
		sprite.flip_h = direction.x < 0.0
	else:
		_rest_sprite()


func _rest_sprite() -> void:
	sprite.offset.y = _base_offset.y


func _ensure_move_actions() -> void:
	var mapping := {
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"move_up": [KEY_W, KEY_UP],
		"move_down": [KEY_S, KEY_DOWN],
	}
	for action in mapping:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for keycode in mapping[action]:
			var event := InputEventKey.new()
			event.physical_keycode = keycode
			if not InputMap.action_has_event(action, event):
				InputMap.action_add_event(action, event)
