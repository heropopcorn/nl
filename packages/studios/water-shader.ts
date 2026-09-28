// GLSL ES port of video_game/shaders/water_flow.gdshader.
export const waterFragment = `
precision highp float;
uniform sampler2D screen_texture;
uniform sampler2D flow_map;
uniform bool has_flow_map;
uniform float flow_speed;
uniform vec4 tint;
uniform vec2 flow_dir;
uniform vec2 region_size;
uniform float current_strength;
uniform float surface_mist;
uniform float refraction_strength;
uniform float director_time;
uniform vec4 bounds;
// Pattern units in pixels; keeps streak width stable for rivers and pools.
const float UNIT_PX = 18.0;
// Pattern units travelled downstream per unit of flow_speed per second.
const float SPEED_UNITS = 14.0;
// Advection distance per phase before it resets (limits smearing on bends).
const float TRAVEL_PER_CYCLE = 5.0;
// Samples along the flow per streak; spacing must stay well below the noise
// feature size or the streaks break into beads.
const int STREAK_TAPS = 14;
const float STREAK_TAP_SPACING = 0.26;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float value_noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Ridged noise averaged along \`dir\`: ridges parallel to the flow survive,
// crossing ridges average out.
float streak_field(vec2 q, vec2 dir, float frequency) {
	float total = 0.0;
	for (int k = 0; k < STREAK_TAPS; k++) {
		float offset = (float(k) - float(STREAK_TAPS - 1) * 0.5) * STREAK_TAP_SPACING;
		float n = value_noise((q + dir * offset) * frequency);
		total += 1.0 - abs(n * 2.0 - 1.0);
	}
	return total / float(STREAK_TAPS);
}

vec2 local_flow(vec2 uv) {
	vec2 fallback = normalize(flow_dir + vec2(0.0001));
	if (!has_flow_map) {
		return fallback;
	}
	vec2 d = texture2D(flow_map, uv).rg * 2.0 - 1.0;
	float len = length(d);
	return len > 0.05 ? d / len : fallback;
}

void main() {
	float clock = director_time;
	if (director_time >= 0.0) {
		clock = director_time;
	}
	vec2 UV = (vec2(gl_FragCoord.x, 720.0 - gl_FragCoord.y) - bounds.xy) / bounds.zw;
 float a = 1.0;
 vec2 SCREEN_UV = gl_FragCoord.xy / vec2(1280.0, 720.0);
	vec2 dir = local_flow(UV);
	vec2 side = vec2(-dir.y, dir.x);
	vec2 p = UV * max(region_size, vec2(1.0)) / UNIT_PX;

	float speed = SPEED_UNITS * flow_speed;
	float moving = step(0.0005, speed);
	float period = clamp(TRAVEL_PER_CYCLE / max(speed, 0.0001), 0.5, 2.4);
	float cycle = clock / period;

	float streams_sum = 0.0;
	float band = 0.0;
	float refract_wave = 0.0;
	float mist = 0.0;
	float weight_sq = 0.0;
	for (int j = 0; j < 2; j++) {
		float c = cycle + float(j) * 0.5;
		float phase = fract(c);
		float index = floor(c) * moving;
		float weight = 1.0 - abs(2.0 * phase - 1.0);
		// A new offset per phase restart hides the reset; a still surface keeps
		// both phases identical so nothing flickers.
		vec2 jitter = vec2(hash21(vec2(index, float(j) + 0.3)), hash21(vec2(float(j) + 3.1, index))) * 23.0 * moving;
		vec2 q = p - dir * phase * speed * period + jitter;

		float line_a = smoothstep(0.715, 0.80, streak_field(q, dir, 1.60));
		float line_b = smoothstep(0.735, 0.82, streak_field(q + vec2(7.7, 3.1), dir, 2.40));
		float breakup = smoothstep(0.10, 0.40, value_noise(q * 0.40 + vec2(3.3, 8.1)));
		float streams = clamp(line_a + line_b * 0.68, 0.0, 1.0) * breakup;

		streams_sum += streams * weight;
		weight_sq += weight * weight;
		band += value_noise(q * 0.30 + vec2(11.0, 2.0)) * weight;
		refract_wave += (value_noise(q * 0.90 + vec2(5.0, 13.0)) - 0.5) * weight;
		mist += value_noise(q * 0.16 + vec2(19.0, 7.0)) * weight;
	}
	// Variance-preserving blend so highlights keep their contrast mid-fade.
	float streams = clamp(streams_sum / sqrt(max(weight_sq, 0.0001)), 0.0, 1.0);
	float crest = smoothstep(0.55, 0.85, band) * 0.6;

	vec2 distortion = side * refract_wave * 0.0044 * refraction_strength;
	vec3 scene = texture2D(screen_texture, SCREEN_UV + distortion * vec2(1.0, -1.0)).rgb;

	vec3 body = mix(scene, tint.rgb, 0.48);
	body *= 0.88 + band * 0.10;
	vec3 col = body;
	col += vec3(0.20, 0.62, 0.88) * crest * 0.20 * current_strength;
	col += vec3(0.86, 0.97, 1.0) * streams * 0.72 * current_strength;
	col += vec3(0.78, 0.90, 0.94) * mist * surface_mist;
	float alpha = a * clamp(tint.a + streams * 0.22 + crest * 0.08, 0.0, 0.94);
	gl_FragColor = vec4(col, alpha);
}
`;
