class_name DirectorAssetDragButton
extends Button

## A compact library tile that works as both a click-to-place fallback and a
## native Godot drag source. The payload is data-only, so it also works on Web.

var asset_id := ""


func _get_drag_data(_at_position: Vector2) -> Variant:
	if asset_id.is_empty() or disabled:
		return null
	var preview := TextureRect.new()
	preview.texture = icon
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.custom_minimum_size = Vector2(84, 84)
	preview.modulate = Color(1, 1, 1, 0.9)
	set_drag_preview(preview)
	return {"kind": "director_asset", "asset_id": asset_id}
