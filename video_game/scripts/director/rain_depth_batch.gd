extends Node2D

## One impact point is one depth anchor. Screen coordinates retain the existing
## rain trajectory while the world anchor participates in World's Y-sort.
var marks: Array = []
var dots: Array = []


func clear_marks() -> void:
	marks.clear()
	dots.clear()
	queue_redraw()


func add_streak(a: Vector2, b: Vector2, color: Color, width: float) -> void:
	marks.append([a, b, color, width])
	queue_redraw()


func add_splash(center: Vector2, age: float, scale: float, alpha: float) -> void:
	var color := Color(0.72, 0.89, 1.0, alpha * (1.0 - smoothstep(0.62, 1.0, age)))
	if age < 0.20:
		dots.append([center, lerpf(2.6, 1.2, age / 0.20) * scale, color])
	var radius := lerpf(2.0, 17.0, age) * scale
	var previous := center + Vector2(radius, 0.0)
	for i in range(1, 9):
		var angle := TAU * float(i) / 8.0
		var point := center + Vector2(cos(angle) * radius, sin(angle) * radius * 0.28)
		add_streak(previous, point, color, clampf(scale, 0.62, 1.65))
		previous = point
	var height := sin(age * PI) * 16.0 * scale
	var spread := lerpf(3.0, 13.0, age) * scale
	add_streak(center + Vector2(-2, 0), center + Vector2(-spread, -height), color, scale)
	add_streak(center + Vector2(2, 0), center + Vector2(spread, -height * 0.88), color, scale)


func _draw() -> void:
	draw_set_transform_matrix(get_global_transform_with_canvas().affine_inverse())
	for mark in marks:
		draw_line(mark[0], mark[1], mark[2], mark[3], true)
	for dot in dots:
		draw_circle(dot[0], dot[1], dot[2])
