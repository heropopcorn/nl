shader_type canvas_item;
render_mode blend_mix, unshaded;

// Sparse, fine rain streaks with illustrated variation. The entire streak
// rotates toward the wind direction, instead of merely sliding sideways.
uniform float intensity : hint_range(0.0, 1.0) = 0.6;
uniform float director_time = -1.0;
uniform vec2 viewport_size = vec2(1920.0, 1080.0);
uniform vec2 wind_direction = vec2(1.0, 0.0);
uniform float wind_strength : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D endpoint_map : filter_nearest, repeat_disable;
uniform bool has_endpoint_map = false;
uniform float endpoint_across_extent = 1.0;
uniform float endpoint_along_extent = 1.0;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 rain_space(vec2 p, vec2 fall_dir) {
	vec2 across_dir = vec2(fall_dir.y, -fall_dir.x);
	return vec2(dot(p, across_dir), dot(p, fall_dir));
}

float rain_layer(vec2 p, vec2 fall_dir, float clock, vec2 cell, float speed, float width, float seed, float density) {
	vec2 q = rain_space(p, fall_dir);
	q.y -= clock * speed;
	q += vec2(seed * 0.037, seed * 0.061);
	vec2 id = floor(q / cell);
	vec2 f = fract(q / cell);
	float keep = step(1.0 - density, hash21(id + vec2(seed, 7.3)));

	float center_x = 0.24 + hash21(id + vec2(3.1, seed)) * 0.52;
	float top = 0.04 + hash21(id + vec2(seed, 5.9)) * 0.18;
	float length_fraction = 0.32 + hash21(id + vec2(1.7, seed)) * 0.54;
	float bottom = min(top + length_fraction, 0.96);
	float progress = clamp((f.y - top) / max(bottom - top, 0.01), 0.0, 1.0);
	// A sub-pixel wobble avoids a mechanically perfect line while preserving
	// the long, clean rain silhouette.
	center_x += sin(progress * 5.2 + hash21(id) * 6.28) * width * 0.10;
	float distance_to_streak = abs((f.x - center_x) * cell.x);
	float line = 1.0 - smoothstep(width, width * 2.15, distance_to_streak);
	float body = smoothstep(top, top + 0.055, f.y) * (1.0 - smoothstep(bottom - 0.10, bottom, f.y));
	float taper = mix(0.52, 1.0, 1.0 - progress);
	return keep * line * body * taper;
}

// Repeats the exact grid used by rain_layer at the contact surface. A splash
// begins when the leading end of that same streak reaches the endpoint, so a
// flower can never appear while its raindrop continues through the object.
float impact_layer(vec2 q, float endpoint, float clock, vec2 cell, float speed, float seed, float density) {
	vec2 endpoint_moving = vec2(q.x, endpoint - clock * speed);
	endpoint_moving += vec2(seed * 0.037, seed * 0.061);
	vec2 id = floor(endpoint_moving / cell);
	vec2 f = fract(endpoint_moving / cell);
	float keep = step(1.0 - density, hash21(id + vec2(seed, 7.3)));
	float center_x = 0.24 + hash21(id + vec2(3.1, seed)) * 0.52;
	float top = 0.04 + hash21(id + vec2(seed, 5.9)) * 0.18;
	float length_fraction = 0.32 + hash21(id + vec2(1.7, seed)) * 0.54;
	float bottom = min(top + length_fraction, 0.96);
	float age_phase = bottom - f.y;
	float life = step(0.0, age_phase) * (1.0 - smoothstep(0.08, 0.15, age_phase));
	float age = clamp(age_phase / 0.15, 0.0, 1.0);
	float center_across = (id.x + center_x) * cell.x - seed * 0.037;
	vec2 delta = vec2(q.x - center_across, q.y - endpoint);

	float contact = 1.0 - smoothstep(0.0015, 0.0048, length(delta * vec2(1.0, 2.0)));
	float radius = length(delta * vec2(1.0, 2.65));
	float target = mix(0.002, 0.015, age);
	float ring = 1.0 - smoothstep(0.0018, 0.0042, abs(radius - target));
	float crown_y = -age * 0.018;
	float crown_left = 1.0 - smoothstep(0.0018, 0.0045, length(delta - vec2(-0.010, crown_y)));
	float crown_right = 1.0 - smoothstep(0.0018, 0.0045, length(delta - vec2(0.010, crown_y)));
	return keep * life * max(contact * (1.0 - age), max(ring, max(crown_left, crown_right) * 0.76));
}

void fragment() {
	float clock = director_time >= 0.0 ? director_time : TIME;
	float i = clamp(intensity, 0.0, 1.0);
	float aspect = max(viewport_size.x, 1.0) / max(viewport_size.y, 1.0);
	vec2 p = (UV - 0.5) * vec2(aspect, 1.0);

	vec2 wind = normalize(wind_direction + vec2(0.0001)) * wind_strength;
	// Still-air rain has only a slight natural slant. Horizontal wind bends it
	// visibly; vertical wind modestly changes the fall speed without ever
	// making rain travel upward.
	vec2 fall_dir = normalize(vec2(0.025 + wind.x * 0.66, 1.0 + wind.y * 0.18));
	float fall_speed = clamp(1.0 + wind.y * 0.20, 0.76, 1.22);
	float density = mix(0.20, 0.54, i);

	float far_rain = rain_layer(p, fall_dir, clock, vec2(0.034, 0.34), 0.74 * fall_speed, 0.00040, 4.0, density);
	float mid_rain = rain_layer(p, fall_dir, clock, vec2(0.058, 0.47), 1.02 * fall_speed, 0.00058, 18.0, density * 0.82);
	float near_rain = rain_layer(p, fall_dir, clock, vec2(0.092, 0.66), 1.34 * fall_speed, 0.00082, 33.0, density * 0.60);

	float rain = clamp(far_rain * 0.46 + mid_rain * 0.72 + near_rain, 0.0, 1.0);
	float splash = 0.0;
	if (has_endpoint_map) {
		vec2 q = rain_space(p, fall_dir);
		float endpoint_u = clamp(q.x / max(endpoint_across_extent * 2.0, 0.0001) + 0.5, 0.0, 1.0);
		vec3 endpoint_data = texture(endpoint_map, vec2(endpoint_u, 0.5)).rgb;
		if (endpoint_data.b > 0.5) {
			float endpoint = mix(-endpoint_along_extent, endpoint_along_extent, endpoint_data.r);
			// Everything downstream of the first framed surface is occluded. The
			// last visible pixel of a streak is therefore also its impact point.
			rain *= 1.0 - step(endpoint + 0.0015, q.y);
			if (endpoint_data.g > 0.5) {
				splash += impact_layer(q, endpoint, clock, vec2(0.034, 0.34), 0.74 * fall_speed, 4.0, density) * 0.46;
				splash += impact_layer(q, endpoint, clock, vec2(0.058, 0.47), 1.02 * fall_speed, 18.0, density * 0.82) * 0.72;
				splash += impact_layer(q, endpoint, clock, vec2(0.092, 0.66), 1.34 * fall_speed, 33.0, density * 0.60);
			}
		}
	}
	splash = clamp(splash, 0.0, 1.0);
	vec3 storm_tint = vec3(0.055, 0.075, 0.12);
	vec3 streak_color = mix(vec3(0.58, 0.66, 0.76), vec3(0.90, 0.94, 0.98), clamp(max(rain, splash) * 1.3, 0.0, 1.0));
	float atmosphere_alpha = 0.10 * i;
	float streak_alpha = rain * mix(0.38, 0.78, i) + splash * mix(0.48, 0.92, i);
	vec3 color = mix(storm_tint, streak_color, clamp(max(rain, splash) * 1.5, 0.0, 1.0));
	COLOR = vec4(color, clamp(atmosphere_alpha + streak_alpha, 0.0, 0.88));
}
