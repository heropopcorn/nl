shader_type canvas_item;
render_mode blend_mix, unshaded;

// A readable directional current.  The previous broad drifting wave is kept as
// a very light surface haze, while narrow broken highlights, refraction and
// travelling current bands make the configured flow direction unmistakable.
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform float flow_speed : hint_range(0.0, 1.5) = 0.22;
uniform vec4 tint : source_color = vec4(0.32, 0.68, 0.90, 0.60);
uniform vec2 flow_dir = vec2(0.18, 0.92);
uniform vec2 region_size = vec2(512.0, 512.0);
uniform float current_strength : hint_range(0.0, 1.5) = 0.95;
uniform float surface_mist : hint_range(0.0, 0.5) = 0.08;
uniform float refraction_strength : hint_range(0.0, 1.0) = 0.32;
uniform float director_time = -1.0;

float hash11(float value) {
	return fract(sin(value * 127.1) * 43758.5453123);
}

void fragment() {
	float clock = TIME;
	if (director_time >= 0.0) {
		clock = director_time;
	}
	float t = clock * flow_speed;
	float a = texture(TEXTURE, UV).a;
	vec2 dir = normalize(flow_dir + vec2(0.0001));
	vec2 side = vec2(-dir.y, dir.x);
	// region_size keeps streak width/speed stable in long rivers and small pools.
	vec2 p = (UV - vec2(0.5)) * max(region_size, vec2(1.0)) / 18.0;
	float along = dot(p, dir);
	float across = dot(p, side);

	// Two families of thin, broken streamlines.  Their phase moves toward +dir.
	float warped_a = across + sin(along * 0.31 - t * 0.75) * 0.16;
	float lane_id_a = floor(warped_a * 0.72);
	float lane_pos_a = fract(warped_a * 0.72);
	float lane_center_a = 0.5 + (hash11(lane_id_a + 7.0) - 0.5) * 0.34;
	float line_a = 1.0 - smoothstep(0.035, 0.135, abs(lane_pos_a - lane_center_a));
	float phase_a = fract(along * 0.115 - t * 1.75 + hash11(lane_id_a + 19.0));
	float dash_a = smoothstep(0.02, 0.12, phase_a) * (1.0 - smoothstep(0.58, 0.92, phase_a));

	float warped_b = across + sin(along * 0.47 - t * 1.05 + 1.7) * 0.11;
	float lane_id_b = floor(warped_b * 1.18);
	float lane_pos_b = fract(warped_b * 1.18);
	float lane_center_b = 0.5 + (hash11(lane_id_b + 31.0) - 0.5) * 0.28;
	float line_b = 1.0 - smoothstep(0.025, 0.105, abs(lane_pos_b - lane_center_b));
	float phase_b = fract(along * 0.18 - t * 2.35 + hash11(lane_id_b + 43.0));
	float dash_b = smoothstep(0.03, 0.16, phase_b) * (1.0 - smoothstep(0.48, 0.86, phase_b));

	float streams = clamp(line_a * dash_a + line_b * dash_b * 0.68, 0.0, 1.0);
	float current_band = 0.5 + 0.5 * sin(along * 0.42 - t * 2.4 + sin(across * 0.63) * 0.8);
	float crest = pow(current_band, 7.0);

	// Subtle refraction makes the overlay feel like a water surface, not smoke.
	float refract_wave = sin(along * 0.52 - t * 2.8 + sin(across * 0.81)) * 0.5
		+ sin(across * 1.33 + along * 0.17 - t * 1.4) * 0.5;
	vec2 distortion = side * refract_wave * 0.0022 * refraction_strength;
	vec3 scene = texture(screen_texture, SCREEN_UV + distortion).rgb;

	// Preserve a small amount of the old soft drift so it can read as surface mist.
	float mist_wave = 0.5 + 0.5 * sin(across * 0.46 + sin(along * 0.17 - t * 0.55) * 1.25 + t * 0.22);
	vec3 body = mix(scene, tint.rgb, 0.48);
	body *= 0.88 + current_band * 0.10;
	vec3 col = body;
	col += vec3(0.20, 0.62, 0.88) * crest * 0.20 * current_strength;
	col += vec3(0.86, 0.97, 1.0) * streams * 0.72 * current_strength;
	col += vec3(0.78, 0.90, 0.94) * mist_wave * surface_mist;
	float alpha = a * clamp(tint.a + streams * 0.22 + crest * 0.08, 0.0, 0.94);
	COLOR = vec4(col, alpha);
}
