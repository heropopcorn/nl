# 主角村场景设计包

本目录把“主角所在的东南边陲小村”从现有镇子级参考中独立出来：中心不再是石板十字路和圆形广场，改为弯曲土路、散落宅基地、浅溪与小块农田；建筑全部为单层、低档泥墙木构和旧瓦。

## 交付物

- `ground-protagonist-village-v1.png`：1536×1024 地面底图；严格俯视，六处建筑预留地，不含房屋。
- `buildings-sheet-v1-opaque-cutout-source.png`：1536×1024，六栋单层建筑，2×3 排布。当前生成器未成功输出真实透明底，因此这是**不透明抠图源**，不能直接当透明 PNG 使用。
- `village-layout-design.md`：功能分区、视觉规则、与镇子资产的差异。
- `placement-notes.md`：切图、坐标、导演台与 Godot 落地说明。
- `prompts.md`：可复用出图提示词。

## 一句话验收口径

看到画面时应先读成“几户农家围着土路和溪沟自然长出来的小村”，而不是“有规划广场和成排楼房的镇子”。

## 当前资产状态

| 文件 | 可直接作为地面 | 可直接当透明建筑 |
|---|---:|---:|
| `ground-protagonist-village-v1.png` | 是 | 不适用 |
| `buildings-sheet-v1-opaque-cutout-source.png` | 否 | 否，需先抠底并切分 |

建筑 sheet 的轮廓分离、行列间距和统一机位已适合人工矩形切分；导入前按 `placement-notes.md` 处理 alpha。
