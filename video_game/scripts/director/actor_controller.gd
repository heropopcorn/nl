class_name ActorController
extends RefCounted

## Maps actor records to independent VillagePlayer instances. The original
## player is reused for the first actor; later actors are lightweight clones.

var _village: VillageSandbox
var _players: Dictionary = {}
var _extra_players: Array[VillagePlayer] = []


func rebuild(village: VillageSandbox, model: DirectorSceneModel, reset_positions: bool) -> void:
	_village = village
	# Inspector edits rebuild visual/collision helpers frequently. Keep every
	# runtime actor where the editor left it unless this is an actual scene load.
	var previous_positions: Dictionary = {}
	if not reset_positions:
		for actor_id in _players:
			var previous := _players[actor_id] as VillagePlayer
			if is_instance_valid(previous):
				previous_positions[str(actor_id)] = previous.position
	_clear_extras()
	_players.clear()
	if village == null or model == null or model.actors.is_empty():
		if village and village.player:
			village.player.visible = true
		return
	var player_scene := load("res://scenes/player/player.tscn") as PackedScene
	var runtime_index := 0
	for i in range(model.actors.size()):
		var actor: Dictionary = model.actors[i]
		if not bool(actor.get("enabled", true)):
			continue
		var player: VillagePlayer
		if runtime_index == 0:
			player = village.player
			player.visible = true
		else:
			player = player_scene.instantiate() as VillagePlayer
			player.name = "DirectorActor_%d" % runtime_index
			var camera := player.get_node_or_null("Camera2D") as Camera2D
			if camera:
				player.remove_child(camera)
				camera.free()
			village.world.add_child(player)
			_extra_players.append(player)
			player.control_enabled = false
		var aid := str(actor.get("id", "actor_%d" % i))
		_players[aid] = player
		apply_appearance(player, str(actor.get("character_id", CharacterRegistry.FARMER)))
		player.z_index = int(actor.get("layer", 0))
		if not reset_positions and previous_positions.has(aid):
			player.position = previous_positions[aid]
		else:
			player.position = village.uv_to_world(DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV))
		runtime_index += 1
	if runtime_index == 0:
		village.player.visible = false


func clear(village: VillageSandbox) -> void:
	_clear_extras()
	_players.clear()
	if village and village.player:
		village.player.stop_path("replace")
		village.player.visible = true


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


func place_all_at_start(village: VillageSandbox, model: DirectorSceneModel) -> void:
	if model == null:
		return
	for actor in model.actors:
		var player := player_for(str(actor.get("id", "")))
		if player:
			player.position = village.uv_to_world(DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV))


func place_at_start(village: VillageSandbox, model: DirectorSceneModel) -> void:
	place_all_at_start(village, model)


func first_actor(model: DirectorSceneModel) -> Dictionary:
	if model == null or model.actors.is_empty():
		return {}
	return model.actors[0]


func actor_by_id(model: DirectorSceneModel, actor_id: String) -> Dictionary:
	if model == null:
		return {}
	for actor in model.actors:
		if str(actor.get("id", "")) == actor_id:
			return actor
	return {}


func player_for(actor_id: String) -> VillagePlayer:
	return _players.get(actor_id) as VillagePlayer


func hit_actor(world_pos: Vector2, zoom: float = 1.0) -> String:
	var best := ""
	var best_z := -2147483648
	for actor_id in _players:
		var player: VillagePlayer = _players[actor_id]
		if player.visible and player.global_position.distance_to(world_pos) <= 34.0 / maxf(zoom, 0.2):
			if player.z_index >= best_z:
				best = str(actor_id)
				best_z = player.z_index
	return best


func playback_world_points(village: VillageSandbox, actor: Dictionary) -> PackedVector2Array:
	var points := PackedVector2Array()
	if actor.is_empty():
		return points
	var start := village.uv_to_world(DirectorSceneModel._vec2(actor.get("start_uv", [0.42, 0.42]), DirectorSceneModel.DEFAULT_START_UV))
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
	if actor.is_empty() or not bool(actor.get("enabled", true)) or _village == null:
		return false
	return playback_world_points(_village, actor).size() >= 2


func play_all(village: VillageSandbox, model: DirectorSceneModel) -> int:
	var started := 0
	for actor in model.actors:
		if not can_play(actor):
			continue
		var player := player_for(str(actor.get("id", "")))
		if player == null:
			continue
		var route: Dictionary = actor.get("route", {})
		var ignore := str(route.get("collision_mode", "ignore")) != "world"
		if player.play_path(playback_world_points(village, actor), bool(route.get("loop", false)), ignore, float(route.get("speed_px_per_sec", 210.0))):
			started += 1
	return started


func pause_all() -> void:
	for value in _players.values():
		(value as VillagePlayer).pause_path()


func resume_all() -> void:
	for value in _players.values():
		(value as VillagePlayer).resume_path()


func stop_all(reason: String = "stop") -> void:
	for value in _players.values():
		(value as VillagePlayer).stop_path(reason)


func any_playing() -> bool:
	for value in _players.values():
		if (value as VillagePlayer).is_playing_path():
			return true
	return false


func _clear_extras() -> void:
	for player in _extra_players:
		if is_instance_valid(player):
			player.stop_path("replace")
			player.free()
	_extra_players.clear()
