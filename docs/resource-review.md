# 资源确认：临时发布、云端标记、本地整理

主工作流仍是本地制作与 GitHub 同步。本模块只解决“云电脑产出的图片／视频／动图，需要本人在顺畅的浏览器里确认”的交接问题。

## 一轮工作流程

1. bot 把**本次待确认**文件写入仓库的 `resource-review/inbox/`，允许按日期／任务创建子目录。生成时先写 `.tmp` 等临时文件，完成后再改为正式扩展名，避免构建读取半成品。
2. 提交并推送。Vercel 构建扫描这些文件，登记新内容，查询云端状态，只复制 `pending`（未标记）的文件到本次静态发布包。
3. 登录 nl，点击顶部“资源确认”：图片查看大图，视频播放，GIF／APNG／动态 WebP 直接预览。标记“可用”或“不可用”，可填写备注。
4. 确认成功提示代表数据库已返回新版本；刷新页面、换电脑、重新部署均不丢标记。保存失败不会显示成功，备注保留在当前窗口。多人／多窗口同时修改会发生版本冲突，必须刷新核对，不能静默覆盖。
5. bot 在仓库执行 `npm run review:sync`，读取 `resource-review/decisions.json` 中的 `usable`、`unusable`、`pending`。每项包含内容 SHA-256、当前本地相对路径、备注、版本号和更新时间。
6. 可用素材由 bot 按任务要求加工、归入正式素材目录；不可用素材可在确认具体目标后移到仓库外的归档目录。本工具**不会自动移动或删除原图**，也不会自动决定资源分类。
7. 下次发布不再携带已标记内容，即使它暂时还留在 inbox。新的文件内容自动成为未标记项，继续上述循环。

### 识别规则

- 以文件**内容 SHA-256**识别，而不是文件名。改名不需要重审；同名覆盖为不同内容，需要重新确认。
- 同一内容在多个路径出现只发布一次，bot 报告列出所有本地路径。
- 同一内容重新生成仍沿用原标记。如需重审，在当前发布批次里选择它，点击“重新设为未标记”；文件仍在 inbox 时，下次构建会重新带上。
- 当前页面的“全部／可用／不可用”指**当前发布批次**，不是全历史素材库。确认记录在数据库保留，bot 结果接口可分页读取历史记录；不再发布的文件不会因此一直占据前端包。

## 实现与边界

- 文件：临时随 Vercel **静态文件**发布，本版不用 Supabase Storage。
- 记录：Supabase Postgres 的 `nl_resource_reviews` 和 `nl_resource_review_events`，后者保留每次修改。
- API：`video_game/api/resource-review.js` 是独立 Vercel Function，沿用当前 nl 登录 Cookie。不是开放本地工作区 API，不上传视频给函数，也不需要常驻服务器。
- 浏览器不拿 Supabase 密钥、不直连数据库，也没有第二套 Supabase 登录。
- bot 只持有本模块的只读令牌；不能写标记、访问本地工作区或绕过素材页面登录。只读令牌与 Supabase 管理密钥是两回事。
- 数据库启用 RLS，撤销 `anon`／`authenticated` 直接访问；只有服务端操作这些专用表。不会修改 imageHandle 的账号、触发器、图章或存储策略。
- 发布时数据库不可用／暂停／缺少状态，**开启确认模块的构建会失败**。不会降级为“全部未确认”。正常本地开发默认关闭模块，不依赖云端。
- PR Preview 如启用本模块，必须配置独立且以 `-preview` 结尾的 namespace。最简单是只在 Production 启用，Preview 不配置相关变量。

支持 PNG、JPEG、WebP、GIF、APNG、MP4、WebM。视频需浏览器可解码，推荐常规 MP4 或 WebM；不提供转码。暂定单文件 50MB、单次发布最多 500 项／200MB；inbox 最多 2000 个不同内容，超出请分批。SVG／HTML／可执行文件不发布。

**重要：**“下次发布不带”只表示新部署包移除这些临时文件，不会销毁 Vercel 旧部署、已下载副本或 Git 历史。此仓库如果公开，提交进 inbox 的原始素材同样公开。敏感素材不适合此发布方式。未来需要私有且可即时撤销的素材访问时，再用私有 Storage。

## 首次线上启用

此功能代码可在未配置云端时构建；页面明确显示“尚未启用”，不会假装把审核结果保存在浏览器。

1. 在 Supabase 后台恢复项目 `wduikxmmxzzcuqokykkr`，检查现有数据。
2. 执行仓库中的 `supabase/migrations/20260929150000_nl_resource_reviews.sql`。只新增 nl 专用确认表和 RPC。此步没有由本次开发自动执行。
3. 在 **Vercel 的 nl 项目、Production 环境**设置以下变量（Build 和 Function 都需可读）：

| 变量 | 用途 |
| --- | --- |
| `NL_REVIEW_ENABLED=1` | 开启待确认素材发布与结果 API |
| `NL_REVIEW_NAMESPACE=nl-production` | 固定确认空间；以后不要随意改名，否则会视为独立确认库 |
| `NL_REVIEW_SUPABASE_URL=https://wduikxmmxzzcuqokykkr.supabase.co` | 现有数据库项目地址 |
| `NL_REVIEW_SUPABASE_SECRET_KEY` | Supabase 服务端 Secret key；兼容旧 `service_role`，绝不能使用 `VITE_` 前缀 |
| `NL_REVIEW_BOT_TOKEN` | 自行生成的随机只读令牌，至少 32 字符；与数据库密钥不同 |
| `AUTH_SECRET` | 沿用现有登录签名密钥，至少 32 字符 |
| `ADMIN_PASSWORD_HASH` | 建议配置自己的登录密码哈希，不继续使用公开默认密码 |

不要将密钥、只读令牌或环境文件提交到 Git。Supabase Secret key 权限很大，应只存在 Vercel／受信任构建环境；不要发给仅负责整理素材的 bot。新 Secret key 通过 `apikey` 头使用，旧 `service_role` 同时带 Bearer JWT。[Supabase 密钥说明](https://supabase.com/docs/guides/getting-started/api-keys)

4. 重新部署。Vercel 会在原静态前端之外创建一个小型 Node Function；Root Directory 仍为 `video_game`，原 build/output 配置不变。[Vercel API 函数说明](https://vercel.com/docs/functions/runtimes/node-js)
5. 先放入一张不敏感的测试图，确认页面标记后可跨浏览器读取，再确认下一次部署不包含这张图。这一步需要真实环境联调，不能用本地模拟测试代替。

## bot 拉取结果

只在 bot 环境配置：

```text
NL_REVIEW_SITE_URL=https://nl-ivory.vercel.app
NL_REVIEW_NAMESPACE=nl-production
NL_REVIEW_BOT_TOKEN=<部署时设置的只读令牌>
```

然后在仓库根目录运行：

```sh
npm run review:sync
```

报告原子写入 `resource-review/decisions.json`（已忽略 Git）。认证、网络或分页校验失败会保留旧报告并返回非零退出码，**bot 必须检查命令成功以及 `fetchedAt`，不能把旧报告当作新决定**。未在云端登记的新内容会列在 `pending` 且 `registered:false`，下次部署后登记。

报告只是按本次读取时的文件哈希匹配的操作依据，不是自动删除授权。执行整理前重新同步，核对源文件内容没变，优先移动到仓库外的可恢复目录。Git 同步仍由显式提交／推送完成，Git LFS 本版未启用。

若 Vercel 另有平台级 Deployment Protection，bot 还需满足该层保护，应用内令牌不能绕过平台访问控制。本模块不自动创建定时保活；Supabase 暂停时需后台恢复。

## 本地测试与备份

默认 `npm run dev`／`npm run work` 不需要确认数据库。需要真实数据库联调时，可在受信任 shell 配置服务端变量后用构建＋`npm start` 或 `npm run work`，沿用本地登录。不要把密钥写到前端代码里。

```sh
node --test tests/resource-review.test.mjs video_game/server/auth.test.mjs
npx playwright test tests/browser/resource-review.spec.ts
```

测试使用模拟数据库覆盖：新素材登记、状态保留、构建排除、改内容重审、读取结果、身份／来源校验、版本冲突、错误恢复及浏览器图片／视频／动图预览。云端迁移和真实 Vercel Function 仍需首次启用时验证。`decisions.json` 可作为当次本地记录，但不是全量数据库备份；请另行备份两个确认表，避免丢失人工判断。
