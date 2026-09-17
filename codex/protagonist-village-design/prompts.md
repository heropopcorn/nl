# 主角村出图提示词

以下提示词延续批准参考的风格，但把经济层级从“镇子”降为“东南边陲小村”。生成时同时上传：地面类以 `chatgpt-terrain-ground-approved.png` 为主参考；建筑类以 `chatgpt-terrain-assets-approved.png` 为主、`house_blue_cottage.png` 只作轮廓辅助。

## A. 地面底图

```text
Use case: stylized-concept
Asset type: production-ready 2D game ground/base map for the protagonist's poor southeast frontier village
Input images: Image 1 is the hard terrain/style reference; Image 2 is palette/material support only. Generate a new map, not a copy of the old town layout.
Primary request: ONLY the ground/terrain layer of a very small modest farming village. Strict top-down orthographic, parallel projection and uniform scale; no buildings or tall standalone props. Warm hand-painted non-pixel 2D farming/RPG art matching Image 1.
Layout: an irregular Y-shaped network of narrow compacted earth paths. The main path enters from the bottom village gate, bends through the village and exits toward upper-left fields; a smaller branch reaches the school clearing and neighbors. A shallow narrow creek follows the right side, with one wooden footbridge crossing and a tiny irrigation ditch feeding two modest fields. Provide exactly six pale dirty-earth building pads with organic edges: protagonist home, slightly larger one-room school, and four neighbors. Keep generous walkable open space.
Tone: poorer and plainer than the town reference, maintained but not landscaped; sun-faded grass, compacted soil and muddy water edges; soft daylight.
Hard constraints: ground layer only; no houses, towers, market stalls, wells, statues, circular paving, round center feature, stone-paved main road, cobblestone cross, formal plaza, walls, people, text or watermark. Pads are bare earth, not stone foundations.
Avoid: perspective, depth scaling, foreground enlargement, town-square symmetry, rich town appearance, photorealism, 3D render, pixel art, palace motifs, hard black shadows, clutter.
```

局部补第六块宅基地时：

```text
Change only the upper-left grassy patch just below and right of the fenced crop plot. Add one small irregular pale compacted-dirt building pad and a short narrow earth spur. Preserve the other five pads and every other map element. No building, foundation, fence, label or prop on the new pad.
```

## B. 单层建筑 sheet（透明底优先）

```text
Use case: stylized-concept
Asset type: transparent PNG game-building sprite sheet for a poor southeast frontier village
Input images: Image 1 is the hard reference for brushwork, orthographic-oblique camera and spacing; Image 2 is only a readable cottage silhouette reference and must be simplified to one story.
Primary request: exactly six separate buildings: protagonist family cottage, tiny one-room schoolhouse, patched-roof neighbor cottage, lean-to neighbor cottage, farm storage shed, and open-sided field shelter. All are genuinely single-story, humble and low-cost.
Style: warm hand-painted non-pixel 2D cozy fantasy farming/RPG art; light eastern influence only; one economic tier poorer than the approved town assets.
Camera: identical fixed top-down isometric / orthographic-oblique 3/4 view; parallel projection; roof and front visible; entrances face the lower edge; uniform scale.
Materials: faded mud plaster, rough timber, weathered gray-brown clay tiles or shingles, patched sections, modest stone footing, plain doors and small windows. School is only slightly wider, with one plain notice board and no text.
Layout: actual transparent canvas, two rows of three, wide transparent gutters, clean alpha edges, no labels.
Hard constraints: exactly six; all one story with a single ground-floor door level; no upper-floor windows, dormers, attic facade that reads as a second floor, towers, market, windmill, watermill, people, animals, scenery clusters or watermark.
Avoid: wealthy cottages, luxury blue roofs, ornate trim, palace eaves, red lanterns, high foundations, stone plaza, drawn checkerboard, flat-color fake transparency, 3D render, photorealism, pixel art, mixed camera angles and overlaps.
```

## C. 纯黑抠图底回退模板

若透明底仍失败，将 B 中的布局段替换为：

```text
Background must be perfectly uniform solid RGB #000000 in every empty pixel: no gradient, glow, vignette, texture, ground plane or ambient haze. Keep only a compact local contact patch beneath each building. Large empty black gutters between all assets for rectangular slicing and background removal.
```

注意：本轮 imagegen 即使收到透明/纯黑硬约束，仍输出了棕绿渐变背景，因此交付的建筑图明确标记为 `opaque-cutout-source`。后续网页端重试时应先验收四角和资产间空白是否为真实 alpha 或统一 RGB，再进入切图。

## D. 单栋重出模板

当 sheet 中某一栋不合格时，不要重出整张：

```text
Generate one standalone [building name] for the same protagonist village. Preserve the approved sheet's exact camera angle, scale, brushwork, weathered mud-plaster/rough-timber/old-tile material language and soft daylight. It must be visibly single-story and modest. Center one complete building on a genuinely transparent PNG with generous margins and a bottom-center placement anchor. No other objects, no text, no watermark.
```
