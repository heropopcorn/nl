class_name CharacterRegistry
extends RefCounted

## P0 placeholder characters. Scenes store stable character_id values only.

const FARMER := "farmer_placeholder"
const FARMER_BLUE := "farmer_blue_placeholder"
const TEXTURE := "res://art/generated/player_placeholder.png"

const ORDER := [FARMER, FARMER_BLUE]


static func display_name(character_id: String) -> String:
	match character_id:
		FARMER:
			return "农夫"
		FARMER_BLUE:
			return "蓝衣农夫"
		_:
			return "农夫（占位）"


static func modulate_color(character_id: String) -> Color:
	match character_id:
		FARMER_BLUE:
			return Color(0.32, 0.52, 0.92, 1)
		_:
			return Color.WHITE


static func texture_path(_character_id: String) -> String:
	return TEXTURE


static func is_known(character_id: String) -> bool:
	return character_id == FARMER or character_id == FARMER_BLUE
