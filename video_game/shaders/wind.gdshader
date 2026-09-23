shader_type canvas_item;
render_mode blend_mix, unshaded;

// Long, fine, hand-drawn gusts inspired by illustrated survival games.
// The strands travel with the selected wind direction, bow gently instead of
// staying ruler-straight, and occasionally finish in a small curled tail.
uniform float strength : hint_range(0.0, 1.0) = 0.45;
uniform vec2 wind_direction = vec2(1.0, 0.0);
uniform float director_time = -1.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Draw one sparse layer of gusts in wind-local coordinates. Sizes are in
// viewport-height units, which keeps the lines fine at every aspect ratio.
vec2 gust_layer(vec2 q, float clock, vec2 cell, float speed, float seed, float density, float width) {
	// Cells stay fixed in space. Time controls how much of a strand has been
	// written and erased; it never translates the completed curve as a whole.
	vec2 fixed_pos = q + vec2(seed * 0.071, seed * 0.043);
	vec2 id = floor(fixed_pos / cell);
	vec2 f = fract(fixed_pos / cell);
	float random_a = hash21(id + vec2(seed, 2.7));
	float random_b = hash21(id + vec2(5.1, seed));
	float keep = step(1.0 - density, random_a);
	float cycle_rate = 0.10 + speed * 0.10;
	float life_phase = fract(clock * cycle_rate + hash21(id + vec2(seed, 39.1)) * 0.97);
	float head_progress = clamp(life_phase / 0.58, 0.0, 1.0);
	float tail_progress = clamp((life_phase - 0.28) / 0.72, 0.0, 1.0);

	float start_x = 0.05 + random_b * 0.10;
	float end_x = 0.72 + hash21(id + vec2(9.3, seed)) * 0.23;
	float base_y = 0.34 + hash21(id + vec2(seed, 11.9)) * 0.32;
	float phase = hash21(id + vec2(17.2, seed)) * PI * 2.0;
	float bow_random = hash21(id + vec2(seed, 21.4));
	float bow_sign = step(0.5, bow_random) * 2.0 - 1.0;
	float bow = bow_sign * mix(0.07, 0.17, abs(bow_random - 0.5) * 2.0);
	float progress = clamp((f.x - start_x) / max(end_x - start_x, 0.01), 0.0, 1.0);
	float center_y = base_y;
	center_y += sin(progress * PI) * bow;
	center_y += sin(progress * PI * 2.0 + phase) * 0.042 * sin(progress * PI);
	// Existing ink only breathes slightly after appearing. This avoids the old
	// effect where the entire snake-like line crawled across the viewport.
	center_y += sin(clock * 0.82 + progress * 5.7 + phase) * 0.010 * sin(progress * PI);

	// Long thin stroke with soft, tapered tips. A faint parallel scratch gives
	// the gust the imperfect inked character seen in the reference.
	float distance_to_line = abs((f.y - center_y) * cell.y);
	float stroke = 1.0 - smoothstep(width, width * 2.25, distance_to_line);
	float spatial_taper = smoothstep(start_x, start_x + 0.08, f.x) * (1.0 - smoothstep(end_x - 0.12, end_x, f.x));
	float written = 1.0 - smoothstep(head_progress, head_progress + 0.055, progress);
	float lingering_tail = smoothstep(tail_progress - 0.10, tail_progress + 0.035, progress);
	float body = spatial_taper * written * lingering_tail;
	float secondary_offset = width * 3.3;
	float secondary = 1.0 - smoothstep(width * 0.60, width * 1.65, abs((f.y - center_y) * cell.y - secondary_offset));
	secondary *= step(0.62, random_b) * body * 0.34;
	stroke = (stroke * body + secondary) * keep;

	// Some strands curl at the trailing end. The spiral is intentionally
	// incomplete so it reads as a wind hook rather than a circular particle.
	float curl_x = mix(start_x, end_x, head_progress);
	float curl_y = base_y + sin(head_progress * PI) * bow;
	curl_y += sin(head_progress * PI * 2.0 + phase) * 0.042 * sin(head_progress * PI);
	vec2 curl_center = vec2(curl_x * cell.x, curl_y * cell.y);
	vec2 local_pos = f * cell;
	vec2 curl_vec = local_pos - curl_center;
	float angle = atan(curl_vec.y, curl_vec.x);
	float curl_radius = width * 9.0 + (angle + PI) * width * 0.85;
	float curl_distance = abs(length(curl_vec) - curl_radius);
	float curl = 1.0 - smoothstep(width * 0.72, width * 1.85, curl_distance);
	float open_arc = smoothstep(-2.75, -2.20, angle) * (1.0 - smoothstep(1.40, 2.05, angle));
	float curl_life = smoothstep(0.08, 0.20, life_phase) * (1.0 - smoothstep(0.78, 0.96, life_phase));
	curl *= open_arc * keep * step(0.70, hash21(id + vec2(seed, 31.7))) * curl_life;

	return vec2(stroke, curl);
}

void fragment() {
	float clock = director_time >= 0.0 ? director_time : TIME;
	float s = clamp(strength, 0.0, 1.0);
	vec2 dir = normalize(wind_direction + vec2(0.0001));
	vec2 side = vec2(-dir.y, dir.x);
	float aspect = max(viewport_size.x, 1.0) / max(viewport_size.y, 1.0);
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	vec2 q = vec2(dot(p, dir), dot(p, side));

	float density = mix(0.26, 0.58, s);
	vec2 far_gust = gust_layer(q, clock, vec2(1.18, 0.31), mix(0.22, 0.55, s), 3.0, density, 0.00072);
	vec2 mid_gust = gust_layer(q, clock, vec2(0.86, 0.25), mix(0.31, 0.74, s), 13.0, density * 0.92, 0.00092);
	vec2 near_gust = gust_layer(q, clock, vec2(0.64, 0.20), mix(0.42, 0.96, s), 29.0, density * 0.74, 0.00112);

	float strands = far_gust.x * 0.56 + mid_gust.x * 0.78 + near_gust.x;
	float curls = far_gust.y * 0.48 + mid_gust.y * 0.68 + near_gust.y * 0.82;
	float wind_ink = clamp(strands + curls, 0.0, 1.0);
	float alpha = clamp(wind_ink * mix(0.34, 0.76, s) * s, 0.0, 0.82);
	// Darker antialiased edges keep the one-pixel strands legible over bright
	// grass, while the warm core retains the chalk/ink look of the reference.
	vec3 ink = mix(vec3(0.34, 0.42, 0.39), vec3(0.96, 0.93, 0.77), smoothstep(0.12, 0.82, wind_ink));
	COLOR = vec4(ink, alpha);
}
