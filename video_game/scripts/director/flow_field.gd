class_name FlowField
extends RefCounted

## Direction field for a water region guided by user-drawn flow lines.
##
## Every line contributes its local tangent (in drawing order), weighted by
## inverse squared distance to the line, so nearer lines dominate and a point
## between two lines follows the resultant of both. Along a single line the
## tangent is blended over nearby segments so bends turn smoothly instead of
## snapping at the vertices.

## Distances are softened by this many pixels so weights stay finite on a line.
## Lines fall off with the inverse square of distance; segments of the same
## line use the inverse fourth power so bends stay local.
const SOFTEN_PX := 10.0


## `lines` are polylines in world/pixel space. Returns a unit vector, or
## `fallback` when there are no usable lines.
static func direction_at(point: Vector2, lines: Array[PackedVector2Array], fallback: Vector2) -> Vector2:
	var total := Vector2.ZERO
	var total_weight := 0.0
	var nearest_distance := INF
	var nearest_tangent := Vector2.ZERO
	for line in lines:
		var tangent_sum := Vector2.ZERO
		var line_distance := INF
		for i in line.size() - 1:
			var a := line[i]
			var segment := line[i + 1] - a
			var length_squared := segment.length_squared()
			if length_squared < 0.000001:
				continue
			var s := clampf((point - a).dot(segment) / length_squared, 0.0, 1.0)
			var distance := point.distance_to(a + segment * s)
			line_distance = minf(line_distance, distance)
			var inverse := 1.0 / (distance + SOFTEN_PX)
			var inverse_sq := inverse * inverse
			tangent_sum += segment * (inverse_sq * inverse_sq / sqrt(length_squared))
		if line_distance == INF or tangent_sum.length_squared() < 1e-30:
			continue
		var tangent := tangent_sum.normalized()
		var line_inverse := 1.0 / (line_distance + SOFTEN_PX)
		var weight := line_inverse * line_inverse
		total += tangent * weight
		total_weight += weight
		if line_distance < nearest_distance:
			nearest_distance = line_distance
			nearest_tangent = tangent
	if total_weight <= 0.0:
		return fallback.normalized() if fallback.length_squared() > 0.000001 else Vector2.DOWN
	# Exactly opposing lines cancel; follow the closer one instead of stalling.
	if total.length() < total_weight * 0.001:
		return nearest_tangent
	return total.normalized()


## Ramer–Douglas–Peucker simplification; keeps the endpoints.
static func simplify(points: PackedVector2Array, tolerance: float) -> PackedVector2Array:
	if points.size() <= 2:
		return points
	var keep := PackedByteArray()
	keep.resize(points.size())
	keep.fill(0)
	keep[0] = 1
	keep[points.size() - 1] = 1
	var stack: Array[Vector2i] = [Vector2i(0, points.size() - 1)]
	while not stack.is_empty():
		var span: Vector2i = stack.pop_back()
		var a := points[span.x]
		var b := points[span.y]
		var farthest := -1
		var farthest_distance := tolerance
		for i in range(span.x + 1, span.y):
			var closest := Geometry2D.get_closest_point_to_segment(points[i], a, b)
			var distance := points[i].distance_to(closest)
			if distance > farthest_distance:
				farthest_distance = distance
				farthest = i
		if farthest >= 0:
			keep[farthest] = 1
			stack.append(Vector2i(span.x, farthest))
			stack.append(Vector2i(farthest, span.y))
	var out := PackedVector2Array()
	for i in points.size():
		if keep[i] == 1:
			out.append(points[i])
	return out


## Bakes the field over `rect` (world space) into an RG8 image where each
## texel stores the direction remapped from [-1, 1] to [0, 1].
static func bake(rect: Rect2, lines: Array[PackedVector2Array], fallback: Vector2, max_texels: int = 48) -> Image:
	var aspect := rect.size.x / maxf(rect.size.y, 1.0)
	var width := clampi(int(round(max_texels * minf(aspect, 1.0))), 4, max_texels)
	var height := clampi(int(round(max_texels / maxf(aspect, 1.0))), 4, max_texels)
	var image := Image.create(width, height, false, Image.FORMAT_RGBA8)
	for y in height:
		for x in width:
			var uv := Vector2((float(x) + 0.5) / float(width), (float(y) + 0.5) / float(height))
			var dir := direction_at(rect.position + rect.size * uv, lines, fallback)
			image.set_pixel(x, y, Color(dir.x * 0.5 + 0.5, dir.y * 0.5 + 0.5, 0.0, 1.0))
	return image
