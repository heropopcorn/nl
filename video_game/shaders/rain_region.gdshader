shader_type canvas_item;
render_mode blend_mix, unshaded;

// World-space rain for a user-drawn surface. Polygon2D clips both falling
// drops and impacts, so a roof can receive rain without painting the room
// or ground underneath it.
uniform float intensity : hint_range(0.0, 1.0) = 0.6;
uniform float director_time = -1.0;
uniform vec2 region_size = vec2(320.0, 180.0);
uniform bool splashes_enabled = true;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float streak_layer(vec2 px, float t, vec2 cell, float speed, float seed) {
	vec2 moving = px;
	moving.x += t * speed * 0.10;
	moving.y -= t * speed;
	vec2 id = floor(moving / cell);
	vec2 f = fract(moving / cell);
	float random = hash21(id + vec2(seed, seed * 0.37));
	float keep = step(mix(0.78, 0.28, intensity), random);
	float center_x = 0.18 + hash21(id + vec2(3.7, seed)) * 0.64;
	float width = mix(0.055, 0.105, intensity);
	float across = 1.0 - smoothstep(width * 0.25, width, abs(f.x - center_x));
	float head = 0.15 + hash21(id + vec2(seed, 8.1)) * 0.42;
	float length = mix(0.18, 0.42, intensity);
	float along = smoothstep(head - length - 0.06, head - length, f.y) * (1.0 - smoothstep(head, head + 0.04, f.y));
	return keep * across * along;
}

float splash_layer(vec2 px, float t, float seed) {
	vec2 cell = vec2(54.0, 38.0);
	vec2 id = floor(px / cell);
	vec2 local = fract(px / cell);
	float random = hash21(id + vec2(seed, seed * 2.1));
	float keep = step(mix(0.82, 0.38, intensity), random);
	float cycle = fract(t * mix(1.55, 2.45, intensity) + random * 1.73);
	float life = 1.0 - smoothstep(0.0, 0.46, cycle);
	vec2 center = vec2(0.18 + hash21(id + vec2(7.1, seed)) * 0.64, 0.40 + hash21(id + vec2(seed, 4.3)) * 0.35);
	vec2 delta = local - center;
	float radius = length(delta * vec2(1.0, 2.6));
	float target = 0.025 + cycle * 0.19;
	float ring = 1.0 - smoothstep(0.018, 0.048, abs(radius - target));
	float crown_left = 1.0 - smoothstep(0.018, 0.055, length(delta - vec2(-0.10, -cycle * 0.18)));
	float crown_right = 1.0 - smoothstep(0.018, 0.055, length(delta - vec2(0.10, -cycle * 0.18)));
	return keep * life * max(ring, max(crown_left, crown_right) * 0.82);
}

void fragment() {
	float clock = director_time >= 0.0 ? director_time : TIME;
	vec2 px = UV * max(region_size, vec2(1.0));
	float i = clamp(intensity, 0.0, 1.0);
	float fine = streak_layer(px, clock, vec2(23.0, 72.0), 390.0, 4.0);
	float heavy = streak_layer(px, clock, vec2(39.0, 104.0), 560.0, 17.0);
	float drops = clamp(fine * 0.68 + heavy, 0.0, 1.0);
	float splash = splashes_enabled ? splash_layer(px, clock, 31.0) : 0.0;
	vec3 drop_color = mix(vec3(0.56, 0.72, 0.88), vec3(0.90, 0.96, 1.0), drops);
	vec3 color = mix(drop_color, vec3(0.78, 0.92, 1.0), splash);
	float alpha = drops * mix(0.30, 0.78, i) + splash * mix(0.42, 0.92, i);
	COLOR = vec4(color, clamp(alpha, 0.0, 0.94));
}
