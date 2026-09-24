# 网页登录

默认账号 `admin`，初始密码为本次需求指定的管理员密码。服务端保存 scrypt 盐值及摘要，页面和 Web 导出不包含明文密码。登录会话保存在 HttpOnly Cookie，有效期 8 小时。编辑器顶部“账号”可进入账号页退出登录。

## 本地启动

先执行 `bash tools/export-web.sh`，再在 `video_game` 目录执行 `npm start`，访问 `http://127.0.0.1:8080`。默认仅监听本机。需要局域网访问可设置 `HOST=0.0.0.0`。本地未设置 AUTH_SECRET 时每次启动生成临时密钥，重启后登录失效。

不能再用 `python -m http.server` 或普通静态托管作为受保护入口，它们不会执行服务端校验。桌面 Godot 编辑器仍按原方式启动。

## Vercel 部署

项目根目录设置为 `video_game`。安装命令已改为 `npm ci`，构建仍为 Godot Web 导出。根目录 middleware.ts 对所有请求（包括 js、wasm、pck）执行校验。

必须在 Vercel 项目环境变量中设置 `AUTH_SECRET`：至少 32 字符的随机密钥，可用 `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` 生成。不要提交密钥。未配置时返回 503，不开放编辑器。设置后重新部署，轮换密钥会使旧会话失效。

可选 `ADMIN_USERNAME` 替换管理员名称；`ADMIN_PASSWORD_HASH` 替换密码摘要，格式为 `salt:hex`，使用 Node scrypt、64 字节输出。修改密码时也应轮换 AUTH_SECRET。

新账号登录仅限制网页访问，场景仍保存在当前浏览器本地，并非云端账号存档。退出登录清除当前浏览器 Cookie，已经下载或打开的内容不会被远程擦除。

验证：`npm run test:auth`。部署适配采用 Vercel 官方 Routing Middleware API：https://vercel.com/docs/routing-middleware/getting-started 。
