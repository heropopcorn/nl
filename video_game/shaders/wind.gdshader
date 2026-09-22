shader_type canvas_item;
render_mode blend_mix, unshaded;

// Screen-space gust ribbons and small airborne flecks. This stays subtle so
// wind remains readable without washing out the scene or rain impacts.
uniform float strength : hint_range(0.0, 1.0) = 0.45;
uniform vec2 wind_direction = vec2(1.0, 0.0);
uniform float director_time = -1.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void fragment() {
	float clock = director_time >= 0.0 ? director_time : TIME;
	float s = clamp(strength, 0.0, 1.0);
	vec2 dir = normalize(wind_direction + vec2(0.0001));
	vec2 side = vec2(-dir.y, dir.x);
	float aspect = max(viewport_size.x, 1.0) / max(viewport_size.y, 1.0);
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);
	float along = dot(p, dir) - clock * mix(0.20, 0.85, s);
	float across = dot(p, side);

	float wave = sin(along * 15.0 + sin(across * 9.0 + clock * 0.8) * 1.4);
	float ribbon = pow(max(0.0, 1.0 - abs(wave) * 2.8), 5.0);
	ribbon *= 0.45 + 0.55 * sin(across * 21.0 + clock) * sin(across * 21.0 + clock);

	vec2 cells = vec2(along * 22.0, across * 18.0);
	vec2 id = floor(cells);
	vec2 f = fract(cells) - 0.5;
	float keep = step(mix(0.94, 0.76, s), hash21(id));
	float fleck = (1.0 - smoothstep(0.02, 0.08, abs(f.y))) * (1.0 - smoothstep(0.12, 0.42, abs(f.x)));
	fleck *= keep;

	float alpha = (ribbon * 0.055 + fleck * 0.24) * s;
	COLOR = vec4(vec3(0.78, 0.88, 0.84), clamp(alpha, 0.0, 0.28));
}
