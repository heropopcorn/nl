shader_type canvas_item;
render_mode blend_mix, unshaded;

// Viewport-sized rain.  Cost stays on the overlay, not the map.  Three
// staggered layers keep a readable downpour on bright village backgrounds
// and on the Godot web / Compatibility renderer, where CPUParticles2D often
// draw with zero alpha.
uniform float intensity : hint_range(0.0, 1.0) = 0.6;
uniform float director_time = -1.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);

float hash11(float value) {
	return fract(sin(value * 127.1) * 43758.5453123);
}

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float rain_layer(vec2 uv, float t, vec2 cell, float speed, float thick, float seed) {
	vec2 p = uv;
	p.x += uv.y * 0.12;
	p.y -= t * speed;
	vec2 id = floor(p / cell);
	vec2 f = fract(p / cell);
	float keep = step(mix(0.42, 0.16, intensity), hash21(id + vec2(seed, 7.3)));
	float cx = 0.32 + hash21(id + vec2(3.1, seed)) * 0.36;
	float top = 0.06 + hash21(id + vec2(seed, 5.9)) * 0.16;
	float len = 0.34 + hash21(id + vec2(1.7, seed)) * 0.30;
	float across = 1.0 - smoothstep(thick * 0.22, thick, abs(f.x - cx));
	float along = smoothstep(top, top + 0.05, f.y) * (1.0 - smoothstep(top + len, top + len + 0.10, f.y));
	float head = 1.0 - smoothstep(top, top + len, f.y);
	return keep * across * along * (0.38 + 0.62 * head);
}

void fragment() {
	float clock = TIME;
	if (director_time >= 0.0) {
		clock = director_time;
	}
	float i = clamp(intensity, 0.0, 1.0);
	float aspect = max(viewport_size.x, 1.0) / max(viewport_size.y, 1.0);
	vec2 uv = UV;
	uv.x *= aspect;

	float far_n = rain_layer(uv, clock, vec2(mix(0.046, 0.024, i), mix(0.22, 0.14, i)), 1.35, mix(0.11, 0.16, i), 4.0);
	float mid_n = rain_layer(uv, clock, vec2(mix(0.068, 0.034, i), mix(0.28, 0.17, i)), 1.95, mix(0.13, 0.20, i), 18.0);
	float near_n = rain_layer(uv, clock, vec2(mix(0.110, 0.054, i), mix(0.36, 0.23, i)), 2.55, mix(0.16, 0.24, i), 33.0);

	float rain = clamp(far_n * 0.42 + mid_n * 0.74 + near_n * 1.08, 0.0, 1.0);
	rain *= mix(0.62, 1.0, i);

	vec3 dim_col = vec3(0.05, 0.08, 0.14);
	vec3 drop_col = vec3(0.86, 0.93, 1.0);
	float dim_a = 0.28 * i;
	float drop_a = rain * mix(0.42, 0.86, i);
	vec3 col = mix(dim_col, drop_col, clamp(rain * 1.25, 0.0, 1.0));
	COLOR = vec4(col, clamp(dim_a + drop_a, 0.0, 0.92));
}
