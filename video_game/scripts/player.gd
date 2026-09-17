extends CharacterBody2D

const WALK_SPEED := 210.0
const SPRINT_SPEED := 320.0

@onready var sprite: Sprite2D = $Sprite2D

var _base_offset := Vector2.ZERO

func _ready() -> void:
	_ensure_move_actions()
	motion_mode = MOTION_MODE_FLOATING
	_base_offset = sprite.offset

func _physics_process(_delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var speed := SPRINT_SPEED if Input.is_key_pressed(KEY_SHIFT) else WALK_SPEED
	velocity = direction * speed
	move_and_slide()
	if direction.length() > 0.1:
		sprite.offset.y = _base_offset.y + sin(Time.get_ticks_msec() * 0.014) * 3.0
		sprite.flip_h = direction.x < 0.0
	else:
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
