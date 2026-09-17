class_name DirectorImages
extends RefCounted

## Decode and clamp uploaded backgrounds. Never writes into res://.

const MAX_BYTES := 12 * 1024 * 1024
const MAX_EDGE := 2048
const MIN_WARN_WIDTH := 320
const MIN_WARN_HEIGHT := 180


static func decode_upload(bytes: PackedByteArray) -> Dictionary:
	var result := {
		"ok": false,
		"image": null,
		"warning": "",
		"error": "",
		"resized": false,
	}
	if bytes.is_empty():
		result["error"] = "无法解码图片"
		return result
	if bytes.size() > MAX_BYTES:
		result["error"] = "图片文件超过 12 MiB"
		return result
	var image := Image.new()
	var err := _load_into(image, bytes)
	if err != OK:
		result["error"] = "无法解码图片"
		return result
	if image.is_empty():
		result["error"] = "无法解码图片"
		return result
	if image.get_format() != Image.FORMAT_RGBA8:
		image.convert(Image.FORMAT_RGBA8)
	var width: int = image.get_width()
	var height: int = image.get_height()
	if width < 1 or height < 1:
		result["error"] = "背景尺寸必须为正整数"
		return result
	if width < MIN_WARN_WIDTH or height < MIN_WARN_HEIGHT:
		result["warning"] = "图片小于 320×180，仍已导入"
	var longest := maxi(width, height)
	if longest > MAX_EDGE:
		var scale := float(MAX_EDGE) / float(longest)
		var next_w := maxi(1, int(round(float(width) * scale)))
		var next_h := maxi(1, int(round(float(height) * scale)))
		image.resize(next_w, next_h, Image.INTERPOLATE_LANCZOS)
		result["resized"] = true
		result["warning"] = "图片最长边已缩至 2048"
	result["ok"] = true
	result["image"] = image
	return result


static func make_blank(size: Vector2i, fill: Color) -> Image:
	var image := Image.create(maxi(1, size.x), maxi(1, size.y), false, Image.FORMAT_RGBA8)
	image.fill(fill)
	return image


static func make_thumbnail(source: Image, max_width: int = 160) -> Image:
	if source == null or source.is_empty():
		return make_blank(Vector2i(160, 90), Color(0.2, 0.2, 0.18, 1))
	var image: Image = source.duplicate() as Image
	if image == null:
		return make_blank(Vector2i(160, 90), Color(0.2, 0.2, 0.18, 1))
	if image.get_format() != Image.FORMAT_RGBA8:
		image.convert(Image.FORMAT_RGBA8)
	var width: int = image.get_width()
	var height: int = image.get_height()
	if width > max_width:
		var scale := float(max_width) / float(width)
		image.resize(maxi(1, int(round(float(width) * scale))), maxi(1, int(round(float(height) * scale))), Image.INTERPOLATE_LANCZOS)
	return image


static func sha256_bytes(bytes: PackedByteArray) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(bytes)
	return ctx.finish().hex_encode()


static func png_bytes(image: Image) -> PackedByteArray:
	return image.save_png_to_buffer()


static func _load_into(image: Image, bytes: PackedByteArray) -> Error:
	if bytes.size() >= 8 and bytes[0] == 0x89 and bytes[1] == 0x50 and bytes[2] == 0x4E and bytes[3] == 0x47:
		return image.load_png_from_buffer(bytes)
	if bytes.size() >= 3 and bytes[0] == 0xFF and bytes[1] == 0xD8 and bytes[2] == 0xFF:
		return image.load_jpg_from_buffer(bytes)
	if _is_webp(bytes):
		return image.load_webp_from_buffer(bytes)
	if image.load_png_from_buffer(bytes) == OK:
		return OK
	if image.load_jpg_from_buffer(bytes) == OK:
		return OK
	return image.load_webp_from_buffer(bytes)


static func _is_webp(bytes: PackedByteArray) -> bool:
	if bytes.size() < 12:
		return false
	return bytes[0] == 0x52 and bytes[1] == 0x49 and bytes[2] == 0x46 and bytes[3] == 0x46 \
		and bytes[8] == 0x57 and bytes[9] == 0x45 and bytes[10] == 0x42 and bytes[11] == 0x50
