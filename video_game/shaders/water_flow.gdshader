shader_type canvas_item;
render_mode blend_mix, unshaded;

// Layered directional current: broad body movement, thin travelling streaks and
// crossing ripples. It deliberately reads as water instead of translucent fog.
uniform float flow_speed : hint_range(0.0, 1.5) = 0.22;
uniform vec4 tint : source_color = vec4(0.42, 0.76, 0.92, 0.48);
uniform vec2 flow_dir = vec2(0.18, 0.92);
uniform float director_time = -1.0;

void fragment() {
	float clock = TIME;
	if (director_time >= 0.0) {
		clock = director_time;
	}
	float t = clock * flow_speed;
	float a = texture(TEXTURE, UV).a;
	vec2 dir = normalize(flow_dir + vec2(0.0001));
	vec2 side = vec2(-dir.y, dir.x);
	vec2 p = UV * vec2(38.0, 38.0);
	float along = dot(p, dir);
	float across = dot(p, side);
	float broad = sin(across * 0.72 + sin(along * 0.24 - t * 2.2) * 1.5 + t * 1.1);
	float current = sin(along * 1.9 - t * 10.0 + sin(across * 0.55) * 2.0);
	float ripples = sin(across * 2.7 + along * 0.32 - t * 4.2);
	float streak = smoothstep(0.70, 0.98, 0.5 + 0.5 * current) * (0.55 + 0.45 * broad);
	float glint = pow(max(0.0, 0.5 + 0.5 * ripples), 12.0);
	vec3 deep = tint.rgb * (0.72 + broad * 0.08);
	vec3 col = deep + vec3(0.35, 0.72, 0.92) * streak * 0.34 + vec3(0.85, 0.96, 1.0) * glint * 0.22;
	COLOR = vec4(col, a * tint.a * (0.92 + streak * 0.08));
}
