shader_type canvas_item;
render_mode blend_mix, unshaded;

// World-space impact response for a user-drawn surface. Falling streaks are
// always rendered full-screen by rain.gdshader; this polygon only marks where
// drops terminate and whether those contacts throw visible splash crowns.
uniform float intensity : hint_range(0.0, 1.0) = 0.6;
uniform float director_time = -1.0;
uniform vec2 region_size = vec2(320.0, 180.0);
uniform bool splashes_enabled = true;
uniform vec2 wind_direction = vec2(1.0, 0.0);
uniform float wind_strength : hint_range(0.0, 1.0) = 0.0;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 impact_data(vec2 px, float t, float seed) {
	vec2 cell = vec2(54.0, 38.0);
	vec2 id = floor(px / cell);
	vec2 local = fract(px / cell);
	float random = hash21(id + vec2(seed, seed * 2.1));
	float keep = step(mix(0.82, 0.38, intensity), random);
	float cycle = fract(t * mix(1.55, 2.45, intensity) + random * 1.73);
	vec2 center = vec2(0.18 + hash21(id + vec2(7.1, seed)) * 0.64, 0.40 + hash21(id + vec2(seed, 4.3)) * 0.35);
	return vec4(local - center, cycle, keep);
}

float contact_layer(vec2 px, float t, float seed) {
	vec4 data = impact_data(px, t, seed);
	vec2 delta = data.xy;
	float cycle = data.z;
	float keep = data.w;
	float life = 1.0 - smoothstep(0.0, 0.20, cycle);
	float dot_hit = 1.0 - smoothstep(0.025, 0.075, length(delta * vec2(1.0, 1.8)));
	vec2 fall_dir = normalize(vec2(wind_direction.x * wind_strength * 0.75, 1.0));
	vec2 side = vec2(-fall_dir.y, fall_dir.x);
	float along = dot(delta, fall_dir);
	float across = dot(delta, side);
	float short_tail = (1.0 - smoothstep(0.025, 0.065, abs(across))) * smoothstep(-0.16, -0.03, along) * (1.0 - smoothstep(-0.03, 0.03, along));
	return keep * life * max(dot_hit, short_tail * 0.72);
}

float splash_layer(vec2 px, float t, float seed) {
	vec4 data = impact_data(px, t, seed);
	vec2 delta = data.xy;
	float cycle = data.z;
	float keep = data.w;
	float life = 1.0 - smoothstep(0.0, 0.52, cycle);
	float radius = length(delta * vec2(1.0, 2.6));
	float target = 0.025 + cycle * 0.19;
	float ring = 1.0 - smoothstep(0.018, 0.048, abs(radius - target));
	vec2 drift = normalize(wind_direction + vec2(0.0001)) * wind_strength * cycle * 0.10;
	float crown_left = 1.0 - smoothstep(0.018, 0.055, length(delta - drift - vec2(-0.10, -cycle * 0.18)));
	float crown_right = 1.0 - smoothstep(0.018, 0.055, length(delta - drift - vec2(0.10, -cycle * 0.18)));
	return keep * life * max(ring, max(crown_left, crown_right) * 0.82);
}

void fragment() {
	float clock = director_time >= 0.0 ? director_time : TIME;
	vec2 px = UV * max(region_size, vec2(1.0));
	float i = clamp(intensity, 0.0, 1.0);
	float contact = contact_layer(px, clock, 31.0);
	float splash = splashes_enabled ? splash_layer(px, clock, 31.0) : 0.0;
	vec3 color = mix(vec3(0.86, 0.95, 1.0), vec3(0.70, 0.88, 1.0), splash);
	float alpha = contact * mix(0.46, 0.88, i) + splash * mix(0.42, 0.94, i);
	COLOR = vec4(color, clamp(alpha, 0.0, 0.94));
}
