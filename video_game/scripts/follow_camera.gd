extends Camera2D

@export var min_zoom := 0.55
@export var max_zoom := 2.2
@export var zoom_step := 0.12

var _dragging := false


func _ready() -> void:
	make_current()
	position_smoothing_enabled = true
	position_smoothing_speed = 6.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_nudge_zoom(zoom_step)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_nudge_zoom(-zoom_step)
		elif event.button_index == MOUSE_BUTTON_MIDDLE or event.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = true
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and not event.pressed:
		if event.button_index == MOUSE_BUTTON_MIDDLE or event.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = false
	elif event is InputEventMouseMotion and _dragging:
		offset -= event.relative / zoom.x
		get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_EQUAL, KEY_KP_ADD:
				_nudge_zoom(zoom_step)
			KEY_MINUS, KEY_KP_SUBTRACT:
				_nudge_zoom(-zoom_step)
			KEY_C, KEY_HOME:
				offset = Vector2.ZERO


func _nudge_zoom(amount: float) -> void:
	var next := clampf(zoom.x + amount, min_zoom, max_zoom)
	zoom = Vector2(next, next)
