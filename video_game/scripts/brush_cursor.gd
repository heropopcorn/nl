extends Node2D

var radius := 18.0
var active := false
var erase := false


func _draw() -> void:
	if not active:
		return
	var color := Color(0.95, 0.55, 0.45, 0.9) if erase else Color(0.72, 0.9, 1.0, 0.9)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 40, color, 2.0)
	draw_circle(Vector2.ZERO, 2.5, color)
