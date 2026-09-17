class_name DirectorGizmos
extends Node2D

var desk: Node


func _ready() -> void:
	z_index = 90
	z_as_relative = false


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if desk and desk.has_method("render_gizmos"):
		desk.render_gizmos(self)
