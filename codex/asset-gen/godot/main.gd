extends Node2D

const GROUND := preload("res://assets/terrain-ground.png")
const LEADS := preload("res://assets/characters-leads-teachers-sheet.png")
const CLASSMATES := preload("res://assets/characters-classmates-sheet.png")
const NATURE := preload("res://assets/nature-sheet.png")
const PROPS := preload("res://assets/village-props-sheet.png")
const HOUSES := preload("res://assets/modest-houses-sheet.png")


func _ready() -> void:
	add_child(_sprite(GROUND, Vector2(576, 324), Vector2(0.75, 0.75), 0))

	# Two modest homes from the optional building sheet.
	add_child(_atlas_sprite(HOUSES, Rect2(0, 0, 887, 887), Vector2(205, 172), Vector2(0.28, 0.28), 4))
	add_child(_atlas_sprite(HOUSES, Rect2(887, 0, 887, 887), Vector2(915, 178), Vector2(0.25, 0.25), 4))

	# Vegetation and common props, cut directly from their transparent sheets.
	add_child(_atlas_sprite(NATURE, Rect2(0, 0, 362, 362), Vector2(85, 420), Vector2(0.42, 0.42), 6))
	add_child(_atlas_sprite(NATURE, Rect2(1086, 0, 362, 362), Vector2(1065, 410), Vector2(0.38, 0.38), 6))
	add_child(_atlas_sprite(NATURE, Rect2(0, 362, 362, 362), Vector2(990, 555), Vector2(0.30, 0.30), 6))
	add_child(_atlas_sprite(PROPS, Rect2(0, 0, 362, 362), Vector2(760, 365), Vector2(0.30, 0.30), 7))
	add_child(_atlas_sprite(PROPS, Rect2(362, 0, 362, 362), Vector2(440, 235), Vector2(0.25, 0.25), 7))
	add_child(_atlas_sprite(PROPS, Rect2(0, 724, 362, 362), Vector2(420, 510), Vector2(0.26, 0.26), 7))
	add_child(_atlas_sprite(PROPS, Rect2(362, 724, 362, 362), Vector2(820, 535), Vector2(0.25, 0.25), 7))

	# Static character cutouts: leads, teachers and representative classmates.
	add_child(_atlas_sprite(LEADS, Rect2(0, 0, 384, 512), Vector2(530, 365), Vector2(0.25, 0.25), 10))
	add_child(_atlas_sprite(LEADS, Rect2(384, 0, 384, 512), Vector2(610, 368), Vector2(0.25, 0.25), 10))
	add_child(_atlas_sprite(LEADS, Rect2(1152, 0, 384, 512), Vector2(690, 338), Vector2(0.23, 0.23), 9))
	add_child(_atlas_sprite(LEADS, Rect2(0, 512, 384, 512), Vector2(745, 345), Vector2(0.22, 0.22), 9))
	add_child(_atlas_sprite(CLASSMATES, Rect2(0, 0, 341, 768), Vector2(515, 478), Vector2(0.15, 0.15), 11))
	add_child(_atlas_sprite(CLASSMATES, Rect2(682, 768, 342, 768), Vector2(655, 482), Vector2(0.15, 0.15), 11))

	_add_title()


func _sprite(texture: Texture2D, position: Vector2, scale_value: Vector2, z: int) -> Sprite2D:
	var node := Sprite2D.new()
	node.texture = texture
	node.position = position
	node.scale = scale_value
	node.z_index = z
	return node


func _atlas_sprite(texture: Texture2D, region: Rect2, position: Vector2, scale_value: Vector2, z: int) -> Sprite2D:
	var atlas := AtlasTexture.new()
	atlas.atlas = texture
	atlas.region = region
	return _sprite(atlas, position, scale_value, z)


func _add_title() -> void:
	var panel := ColorRect.new()
	panel.position = Vector2(20, 18)
	panel.size = Vector2(385, 57)
	panel.color = Color(0.10, 0.09, 0.07, 0.72)
	panel.z_index = 50
	add_child(panel)

	var label := Label.new()
	label.position = Vector2(38, 29)
	label.text = "YUANLI · STATIC ASSET PREVIEW"
	label.add_theme_font_size_override("font_size", 22)
	label.add_theme_color_override("font_color", Color(1.0, 0.96, 0.84, 1.0))
	label.z_index = 51
	add_child(label)
