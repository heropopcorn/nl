# 季节背景生成记录

使用内置 imagegen，分别编辑原有两张背景。初／仲／晚表示季节阶段，不表示早中晚时间。原图保留，新增 24 张独立 PNG（1536×1024），默认资源列表显示缩略图。

## 参考图

- `video_game/art/backgrounds/protagonist_village.png`
- `video_game/art/backgrounds/village_school.png`

## 提示词

### protagonist_village_spring_early

Create ONE standalone landscape game background: an EARLY SPRING variant of the referenced village map. Preserve exactly the reference camera, framing, aspect ratio, buildings, roof silhouettes, roads, river banks, bridge, fences, garden plots and all object positions. Same hand-painted Chinese rural 2.5D game art, no people, no text, no UI, no collage. Seasonal changes only: just-thawing ground, sparse pale fresh green shoots, tree branches with tiny buds and a few first pale pink blossoms, muted winter grass giving way to new growth, clear flowing river. Soft neutral daylight, not sunrise or sunset. It must be obviously early spring, retain unobstructed walkable paths. Output a single full image at reference landscape aspect ratio. Save generated image to a local file and report its path.

### protagonist_village_spring_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone spring mid seasonal variant of this exact Chinese rural village game background. Seasonal details: abundant pink and white blossom on existing flowering trees, vivid fresh light green leaves, flourishing spring flowers. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep the original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of the SEASON, never time of day. No people, no writing, no UI, no border, no collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_spring_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone spring late seasonal variant of this exact Chinese rural village game background. Seasonal details: full fresh green canopies, mostly faded blossom with scattered petals, growing vegetable seedlings. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep the original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of the SEASON, never time of day. No people, no writing, no UI, no border, no collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_summer_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer early seasonal variant of this exact Chinese rural village game background. Seasonal details: fresh full green foliage, lush grass, young growing crops, a few white summer wildflowers; no pink spring blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep the original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of the SEASON, never time of day. No people, no writing, no UI, no border, no collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_summer_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer mid seasonal variant of this exact Chinese rural village game background. Seasonal details: dense deep emerald green canopies, luxuriant crops and grass, bright warm summer daylight; no spring blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep the original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of the SEASON, never time of day. No people, no writing, no UI, no border, no collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_summer_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer late seasonal variant of this exact Chinese rural village game background. Seasonal details: mature dusty olive green foliage, subtly dry golden grass tips, mature garden crops, warm hazy daylight; no blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_autumn_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn early seasonal variant of this exact Chinese rural village game background. Seasonal details: mostly green trees with distinct yellowing leaf edges, first ochre fallen leaves, ripening crops. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_autumn_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn mid seasonal variant of this exact Chinese rural village game background. Seasonal details: rich golden yellow and burnt orange deciduous trees, red accents, scattered colorful fallen leaves, harvested garden patches. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_autumn_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn late seasonal variant of this exact Chinese rural village game background. Seasonal details: mostly bare branching trees with sparse copper leaves, many fallen leaves along edges, dry brown grass, harvested bare garden beds. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_winter_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter early seasonal variant of this exact Chinese rural village game background. Seasonal details: bare deciduous trees, thin frost and sparse light snow patches on rooftops and ground edges, cold muted daylight. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_winter_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter mid seasonal variant of this exact Chinese rural village game background. Seasonal details: deep winter snow covering roofs trees and grass, bare frosted branches, packed snow paths still readable, icy river edges where present. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### protagonist_village_winter_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter late seasonal variant of this exact Chinese rural village game background. Seasonal details: patchy melting snow on roofs and shaded ground, thawed damp earth, bare branches with tiny buds, no full spring flowers. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_spring_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone spring early seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: tiny buds, sparse first blossoms, thawing earth and pale fresh shoots. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_spring_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone spring mid seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: abundant pink and white blossom on existing flowering trees, vivid fresh light green leaves, flourishing spring flowers. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_spring_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone spring late seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: full fresh green canopies, mostly faded blossom with scattered petals, growing vegetable seedlings. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_summer_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer early seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: fresh full green foliage, lush grass, young growing crops, a few white summer wildflowers; no pink spring blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_summer_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer mid seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: dense deep emerald green canopies, luxuriant crops and grass, bright warm summer daylight; no spring blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_summer_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone summer late seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: mature dusty olive green foliage, subtly dry golden grass tips, mature garden crops, warm hazy daylight; no blossoms. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_autumn_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn early seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: mostly green trees with distinct yellowing leaf edges, first ochre fallen leaves, ripening crops. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_autumn_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn mid seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: rich golden yellow and burnt orange deciduous trees, red accents, scattered colorful fallen leaves, harvested garden patches. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_autumn_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone autumn late seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: mostly bare branching trees with sparse copper leaves, many fallen leaves along edges, dry brown grass, harvested bare garden beds. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_winter_early

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter early seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: bare deciduous trees, thin frost and sparse light snow patches on rooftops and ground edges, cold muted daylight. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_winter_mid

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter mid seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: deep winter snow covering roofs trees and grass, bare frosted branches, packed snow paths still readable, icy river edges where present. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

### village_school_winter_late

Use case: lighting-weather. Input image is the edit target. Produce ONE standalone winter late seasonal variant of this exact Chinese rural school courtyard game background. Seasonal details: patchy melting snow on roofs and shaded ground, thawed damp earth, bare branches with tiny buds, no full spring flowers. Preserve EXACT camera, framing, 1536x1024 landscape canvas, architectural geometry, roof shapes, paths, fences, river banks and bridge if present, garden plots, props and tree trunk positions. Change seasonal vegetation, ground cover and snow only. Keep original hand-painted elevated 2.5D style and readable walkable paths. Neutral daytime appropriate to season; early/mid/late means phase of SEASON, never time of day. No people, writing, UI, borders or collage. No buildings or objects added or removed. One full landscape image.

## 输出目录

`video_game/art/backgrounds/seasons/`。文件名使用上述标题加 `.png`，每场景 12 张；资源中文名称按初春／仲春／晚春等标注。
