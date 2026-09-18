class_name DirectorCanvasDropTarget
extends ColorRect

## Keeps drag/drop handling on the canvas without coupling the generic asset
## tile to DirectorDesk.

var desk: Node


func _can_drop_data(at_position: Vector2, data: Variant) -> bool:
	return desk != null and desk.can_drop_asset(at_position, data)


func _drop_data(at_position: Vector2, data: Variant) -> void:
	if desk != null:
		desk.drop_asset(at_position, data)
