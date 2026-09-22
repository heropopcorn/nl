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
	float moon_glow = exp(-distance(SCREEN_UV, moon_origin) * 2.2);
	float diagonal = 1.0 - smoothstep(0.04, 0.80, abs((SCREEN_UV.x - moon_origin.x) + (SCREEN_UV.y - moon_origin.y) * 0.48));
	// A real illumination control: the whole night gains readable cool fill,
	// while the upper-right moon direction remains visibly brighter. The old
	// vignette darkening cancelled much of this gain and made the slider appear
	// ineffective.
	float fill = moonlight * 0.20;
	float directional = moonlight * (moon_glow * 0.26 + diagonal * 0.09);
	graded = graded * (1.0 + fill) + vec3(0.30, 0.43, 0.68) * (fill + directional);
	COLOR = vec4(clamp(graded, vec3(0.0), vec3(1.0)), 1.0);
}
