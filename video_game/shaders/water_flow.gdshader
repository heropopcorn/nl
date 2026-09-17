shader_type canvas_item;
render_mode blend_mix, unshaded;

// Placeholder stream: keep the river mask in place and animate highlights.
uniform float flow_speed : hint_range(0.0, 1.5) = 0.22;
uniform vec4 tint : source_color = vec4(0.42, 0.76, 0.92, 0.48);
uniform vec2 flow_dir = vec2(0.18, 0.92);

void fragment() {
	float t = TIME * flow_speed;
	float a = texture(TEXTURE, UV).a;
	vec2 n = UV * vec2(22.0, 36.0) + flow_dir * t * 2.4;
	float wave = sin(n.y + t * 7.0) * cos(n.x * 0.65 - t * 4.2);
	float sparkle = pow(0.5 + 0.5 * sin(n.x * 2.8 + t * 5.0) * sin(n.y * 2.1 - t * 3.4), 9.0);
	vec3 col = tint.rgb * (0.86 + 0.14 * wave) + vec3(0.62, 0.88, 1.0) * sparkle * 0.4;
	COLOR = vec4(col, a * tint.a);
}
