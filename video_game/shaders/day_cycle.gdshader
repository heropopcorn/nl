shader_type canvas_item;
render_mode unshaded;

// Full-screen colour grading for morning/noon/evening/night.  The night
// grade also adds a cool moonlit wash from the upper-right of the viewport.
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec3 grade_color = vec3(1.0);
uniform float grade_strength : hint_range(0.0, 1.0) = 0.0;
uniform float exposure : hint_range(0.35, 1.35) = 1.0;
uniform float contrast : hint_range(0.7, 1.3) = 1.0;
uniform float moonlight : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec3 source = texture(screen_texture, SCREEN_UV).rgb;
	vec3 graded = mix(source, source * grade_color, grade_strength) * exposure;
	graded = (graded - 0.5) * contrast + 0.5;

	vec2 moon_origin = vec2(0.84, 0.10);
	float moon_glow = exp(-distance(SCREEN_UV, moon_origin) * 3.2);
	float diagonal = 1.0 - smoothstep(0.0, 0.72, abs((SCREEN_UV.x - moon_origin.x) + (SCREEN_UV.y - moon_origin.y) * 0.48));
	float moon_wash = moonlight * (moon_glow * 0.24 + diagonal * 0.055);
	graded += vec3(0.34, 0.48, 0.72) * moon_wash;

	float vignette = smoothstep(0.92, 0.28, length((SCREEN_UV - 0.5) * vec2(0.86, 1.0)));
	graded *= mix(1.0 - moonlight * 0.12, 1.0, vignette);
	COLOR = vec4(clamp(graded, vec3(0.0), vec3(1.0)), 1.0);
}
