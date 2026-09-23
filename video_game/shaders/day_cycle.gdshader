shader_type canvas_item;
render_mode unshaded;

// Full-screen colour grading for morning/noon/evening/night.  The night
// grade also adds a cool moonlit wash from the upper-right of the viewport.
uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec3 grade_color = vec3(1.0);
uniform float grade_strength : hint_range(0.0, 1.0) = 0.0;
uniform float exposure : hint_range(0.35, 1.35) = 1.0;
uniform float contrast : hint_range(0.7, 1.3) = 1.0;
uniform float night_ambient : hint_range(0.0, 1.0) = 1.0;
uniform float moonlight : hint_range(0.0, 1.0) = 0.0;
uniform float lightning_light : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec3 source = texture(screen_texture, SCREEN_UV).rgb;
	vec3 graded = mix(source, source * grade_color, grade_strength) * exposure;
	graded = (graded - 0.5) * contrast + 0.5;
	// Night ambient is a true light level: zero removes all base visibility,
	// while one exactly preserves the former default night grade.
	graded *= night_ambient;

	vec2 moon_origin = vec2(0.84, 0.10);
	float moon_glow = exp(-distance(SCREEN_UV, moon_origin) * 2.2);
	float diagonal = 1.0 - smoothstep(0.04, 0.80, abs((SCREEN_UV.x - moon_origin.x) + (SCREEN_UV.y - moon_origin.y) * 0.48));
	// Moonlight relights the original scene instead of adding a flat blue veil,
	// so texture details remain visible even when night ambient is zero.
	float fill = moonlight * 0.48;
	float directional = moonlight * (moon_glow * 0.30 + diagonal * 0.12);
	vec3 source_light_color = clamp(grade_color * vec3(0.72, 0.78, 0.88), vec3(0.0), vec3(1.1));
	graded += source * source_light_color * (fill + directional);
	graded += vec3(0.018, 0.034, 0.075) * (fill + directional);

	// Lightning is another independent light source. It reveals the original
	// scene during a flash even in absolute darkness, with a much whiter/cooler
	// colour than the steady blue moonlight.
	float flash_light = lightning_light * lightning_light;
	graded += source * vec3(0.78, 0.88, 1.08) * flash_light;
	graded += vec3(0.035, 0.045, 0.070) * flash_light;
	COLOR = vec4(clamp(graded, vec3(0.0), vec3(1.0)), 1.0);
}
