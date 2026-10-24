# 穿越火线 · 网页怀旧版 (CrossFire fan remake)

纯浏览器 3D FPS，three.js + Vite。所有模型、贴图、音效都是代码程序化生成的，没有任何外部素材。

## 运行

```bash
npm install
npm run dev
```

然后打开 http://localhost:5173 。第一次点击页面后才会有声音（浏览器限制）。

## 内容

- **模式**：团队竞技、个人竞技、爆破模式（C4 安放/拆除）、生化模式（母体、感染、最后一人变英雄）、挑战模式（十波僵尸 + 巨型魔王，击杀掉宝箱，结算翻牌拿神器）
- **地图**：运输船、沙漠灰、黑色城镇
- **武器**：AK-47、M4A1-S、AN-94、SG552、MP5、UZI、P90、AWM、巴雷特、SVD、M870、XM1014、M249、沙鹰、USP、Glock-18、军刀、斧头、马来剑、高爆/闪光/烟雾弹，以及火麒麟、黑龙、黄金等神器
- **AI**：4 档难度的机器人，会寻路、压枪、听枪声、蹲射、拉枪线；生化模式里人类会找点位蹲守，僵尸会跳跃追人
- **成长**：GP、军衔经验、商城、仓库、战绩，存档在浏览器 localStorage

## 操作

WASD 移动 · 空格 跳 · Ctrl/C 蹲 · Shift 静步 · 左键 射击 · 右键 开镜/重击 · R 换弹 · 1-4/滚轮 切枪 · Q 快切 ·
E 安放/拆除 C4 · B 更换装备（出生点/准备阶段）· Tab 计分板 · F 僵尸技能 · Esc 暂停

## 开发

- `preview.html?guns=all` / `?gun=ak47&variant=qilin` / `?chars=all` / `?char=zombie&kind=boss&anim=attack` / `?map=transport` — 模型预览
- 模块约定见 `docs/INTERFACES.md`
