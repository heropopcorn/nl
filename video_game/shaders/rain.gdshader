shader_type canvas_item;
render_mode blend_mix, unshaded;

// Atmospheric storm grade only. Visible rain is drawn by RainDropOverlay so
// every streak has a concrete impact point inside a user-framed rain region.
// Keeping the weather uniforms here preserves the controller's shared API.
uniform float intensity : hint_range(0.0, 1.0) = 0.6;
uniform float director_time = -1.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);
uniform vec2 wind_direction = vec2(1.0, 0.0);
uniform float wind_strength : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	float i = clamp(intensity, 0.0, 1.0);
	vec3 storm_tint = vec3(0.055, 0.075, 0.12);
	// A small wind-dependent shift keeps these API uniforms active without
	// reintroducing free-floating screen-space streaks.
	float wind_tone = clamp(length(wind_direction) * wind_strength, 0.0, 1.0);
	float stable_time = director_time >= 0.0 ? director_time : TIME;
	float viewport_guard = step(1.0, min(viewport_size.x, viewport_size.y));
	vec3 color = storm_tint + vec3(0.004, 0.006, 0.010) * wind_tone;
	COLOR = vec4(color, 0.085 * i * viewport_guard + stable_time * 0.0);
}
