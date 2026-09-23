shader_type canvas_item;
render_mode blend_mix, unshaded;

// A short cold scene flash plus a narrow, branching bolt. The controller
// supplies a deterministic double-pulse envelope and a changing bolt seed.
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform float bolt_seed = 0.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);

float hash11(float value) {
	return fract(sin(value * 127.1) * 43758.5453123);
}

float bolt_line(vec2 uv, float seed, float offset, float width) {
	float segments = 12.0;
	float row = floor(uv.y * segments);
	float jitter = (hash11(row + seed * 17.0) - 0.5) * 0.20;
	float drift = (uv.y - 0.5) * (hash11(seed + 2.7) - 0.5) * 0.20;
	float x = 0.28 + hash11(seed) * 0.44 + jitter + drift + offset;
	float taper = 1.0 - smoothstep(0.12, 0.96, uv.y);
	return (1.0 - smoothstep(width * 0.3, width, abs(uv.x - x))) * taper;
}

void fragment() {
	float f = clamp(flash, 0.0, 1.0);
	float bolt = bolt_line(UV, bolt_seed, 0.0, 0.006);
	float branch = bolt_line(vec2(UV.x, UV.y * 1.18 - 0.04), bolt_seed + 3.1, 0.055, 0.0035) * step(0.22, UV.y) * (1.0 - step(0.66, UV.y));
	float bolt_alpha = max(bolt, branch * 0.72) * smoothstep(0.18, 0.75, f);
	// Scene relighting is handled by day_cycle.gdshader; this layer supplies
	// the visible bolt and a restrained atmospheric bloom above it.
	float ambient = f * 0.16;
	vec3 color = mix(vec3(0.68, 0.78, 1.0), vec3(0.94, 0.97, 1.0), bolt_alpha);
	COLOR = vec4(color, clamp(ambient + bolt_alpha * 0.92, 0.0, 0.96));
}
