# 订购小屋

面向个人收藏的订购管理应用。当前里程碑只提供可构建的 Pages 静态前端、Worker API 和页面上的连接状态，不含订单、封面上传或房间功能。

## 本地验收

需要 Node.js 22.12+ 和 pnpm 12.23.0。首次安装依赖和下载测试浏览器需要网络，无需 Cloudflare 账号、生产密钥或云资源。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:e2e
```

- `pnpm build` 分别生成 `apps/web/dist/`（Pages 静态资源）和 `apps/api/dist/`（Wrangler dry-run Worker bundle，不部署）。也可单独运行 `pnpm build:web` 或 `pnpm build:api`。
- `pnpm test` 检查健康响应、跨域限制和 API 路由行为。
- `pnpm test:e2e` 准备 Playwright Chromium Headless Shell，自动启动构建后的静态前端（4173）和本地 Worker（8791）。真实浏览器跨源读取 `/api/health`，并检查失败后从页面重试的行为。这两个端口应空闲。在缺少 Chromium 系统库的 Linux 主机上，先运行 `pnpm exec playwright install-deps chromium`。

## 本地开发

在两个终端分别运行：

```sh
pnpm --filter @order-room/api dev --ip 127.0.0.1 --port 8787
pnpm --filter @order-room/web dev --host 127.0.0.1 --port 5173 --strictPort
```

打开 `http://127.0.0.1:5173`。Worker 的 `GET /api/health` 返回 `{"status":"ok"}`，表示 Worker 正在处理请求，不测试数据库或桶的可读写性。`apps/api/wrangler.jsonc` 配置了 D1（`DB`）和私有封面桶（`COVERS`）绑定，Wrangler 本地模式使用本地模拟资源。

## 部署边界

- Pages 构建命令为 `pnpm build:web`，输出目录为 `apps/web/dist/`。前后端不同源时，构建前设置 `VITE_API_BASE_URL` 为 Worker 的公开源（如 `https://api.example.com`），并将 Worker 的 `WEB_ORIGIN` 设置为对应 Pages 源（不含路径或末尾斜杠）。未设置 `VITE_API_BASE_URL` 时，生产前端请求同源下的 `/api/health`。
- `wrangler.jsonc` 的 D1 ID 是本地占位值，部署前需替换并配置真实桶；不要公开 R2 桶。本项目基线不创建资源或发布服务。
- 当前只有公开健康检查，没有测试身份或私有 API。后续私有操作须在 Worker 侧接入并校验中台身份；CORS 不替代鉴权。此阶段不接入真实身份中台。
