class_name ActorController
extends RefCounted

## Maps the first P0 actor onto VillagePlayer and builds playback polylines.


func apply_appearance(player: VillagePlayer, character_id: String) -> void:
	if player == null:
		return
	var sprite: Sprite2D = player.get_node_or_null("Sprite2D")
	if sprite == null:
		return
	var path := CharacterRegistry.texture_path(character_id)
	if ResourceLoader.exists(path):
		sprite.texture = load(path)
	sprite.modulate = CharacterRegistry.modulate_color(character_id)


func place_at_start(village: VillageSandbox, model: DirectorSceneModel) -> void:
	var actor := first_actor(model)
	if actor.is_empty():
		return
	village.player.position = village.uv_to_world(
		DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV)
	)


func first_actor(model: DirectorSceneModel) -> Dictionary:
	if model == null or model.actors.is_empty():
		return {}
	return model.actors[0]


func playback_world_points(village: VillageSandbox, actor: Dictionary) -> PackedVector2Array:
	var points := PackedVector2Array()
	if actor.is_empty():
		return points
	var start := village.uv_to_world(
		DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV)
	)
	points.append(start)
	var route: Dictionary = actor.get("route", {})
	var raw: Variant = route.get("points_uv", [])
	if raw is Array:
		for item in raw:
			var world := village.uv_to_world(DirectorSceneModel._vec2(item, Vector2.ZERO))
			if points.size() == 1 and world.distance_to(start) <= 1.5:
				continue
			points.append(world)
	return points


func can_play(actor: Dictionary) -> bool:
	if actor.is_empty():
		return false
	var route: Dictionary = actor.get("route", {})
	var raw: Variant = route.get("points_uv", [])
	return raw is Array and (raw as Array).size() >= 2
