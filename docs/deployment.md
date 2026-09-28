# 当前部署说明（2026-09-28）

本文记录 nl 导演台（web director）目前的实际部署方式，以及已确定的后续存储方向。

## 1. 总览

| 项目 | 现状 |
|---|---|
| 代码仓库 | GitHub `heropopcorn/nl`，主分支 `main` |
| 托管平台 | Vercel，项目名 `nl` |
| 正式地址 | https://nl-ivory.vercel.app （国内不挂代理无法访问，属预期） |
| 发布触发 | 推送或合并到 `main` 后，Vercel 自动部署正式环境 |
| 预览环境 | 每个 PR 自动生成一个 Vercel 预览部署 |
| 线上形态 | 纯静态前端 + Vercel 中间件登录，无后端服务、无数据库 |

## 2. 构建流程

Vercel 项目的 Root Directory 是 `video_game`，配置在 `video_game/vercel.json`：

- `installCommand`：`npm ci`
- `buildCommand`：`bash tools/build-director-web.sh`
- `outputDirectory`：`export/web`
- 所有路径响应头 `Cache-Control: private, no-store`（不走 CDN 缓存）

`video_game/tools/build-director-web.sh` 做的事：

1. 回到仓库根目录执行 `npm ci`、`npm run build`。
2. `npm run build` 会先跑 `prepare:assets`（`apps/director-web/scripts/prepare-assets.mjs`），把仓库里的图片复制到 `apps/director-web/public/art/`，并生成 `public/assets.json` 资源清单；然后 `tsc --noEmit` 类型检查，再用 Vite 构建。
3. 把 `apps/director-web/dist/` 复制到 `video_game/export/web/`，由 Vercel 作为静态站点提供。

代码结构：`apps/director-web`（React + Vite 前端）、`packages/core`、`packages/studios`、`packages/spritesheet`。

## 3. 登录

- 由 `video_game/middleware.ts` 拦截所有路径（Node.js runtime），逻辑在 `video_game/server/auth.mjs`。
- 未登录访问 `/` 返回 303 跳转 `/login`；`/login` 正常返回 200。
- 需要的 Vercel 环境变量：`AUTH_SECRET`（至少 32 字符）、`ADMIN_USERNAME`（默认 `admin`）、`ADMIN_PASSWORD_HASH`。

## 4. 资源与数据存放位置

| 类型 | 存放位置 | 说明 |
|---|---|---|
| 默认资源（背景、nl-UI 图、树木房屋道具、季节背景等） | Git 仓库：`assets/nl-ui/`（约 86MB）、`video_game/art/`（约 106MB） | 构建时打包进前端，随每次部署发布；当前构建产物约 189MB。新增默认图必须提交并重新部署。 |
| 用户上传的图片／音频、序列帧、自定义分类、场景项目 | 浏览器本地 IndexedDB（库名 `yuanli-director`），小项目同时镜像到 localStorage | 媒体以 Base64 内嵌在项目 JSON 中；不上传服务器。换设备或清浏览器数据即丢失，只能靠导出／备份。 |

## 5. 线上与本地的差异

- 本地开发：`npm run dev`，地址 http://127.0.0.1:5173，无登录，不要暴露公网。
- 本地生产模式：`npm run build && npm start`（`apps/director-web/server.mjs`，默认 http://127.0.0.1:4173）。
- **MP4 导出接口 `/api/export` 只存在于本地 `apps/director-web/server.mjs`，线上 Vercel 没有此接口**，线上导出不可用。

## 6. 发布流程（约定）

1. 从 `main` 新建分支，提交改动（不提交 `codex/` 下的 Codex 工作记录、`test-results/`）。
2. 开 PR 到 `main`，等待 Vercel 预览部署 READY。
3. 合并 PR，等待正式部署 READY。
4. 验证：未登录访问 https://nl-ivory.vercel.app/ 返回 303 到 `/login`，`/login` 返回 200。

## 7. 已知问题

- 部署包随默认图片增长越来越大（当前约 189MB）。
- 用户数据只在本机浏览器，没有云端存档，无法跨设备。
- 媒体 Base64 内嵌项目 JSON，保存、撤销、备份都随资源增大变重。
- 线上无 MP4 导出、无后台视频处理。

## 8. 后续存储方向（已定方向，尚未实施）

- 网页端继续放在海外（Vercel），不做国内 ICP 备案。
- 网页之外的服务全部使用阿里云中国内地以外地域（优先香港），避免备案：
  - 对象存储：OSS 香港（绑定自定义域名，浏览器通过 STS 临时凭证分片直传）。
  - 数据库：RDS PostgreSQL 香港。
  - 接口：函数计算 FC 香港（登录校验、项目读写、资源登记、签发上传凭证）。
- 数据库只保存对象路径／资源 ID，不保存完整 URL，便于日后迁移到内地地域。
- 选型调研详见 `/workspace/nl-docs/cloud-storage-db-research.md`（未入库）；Codex 的部署优化建议分三步：默认素材外置 + 缩略图，本地文件与项目 JSON 拆分并接入云端保存，最后补后台视频处理与线上 MP4 导出。
