# 私有管理 API

下列路径均相对于 `/api/manage`，响应默认是 JSON，且禁止缓存。`GET /api/health` 独立于管理 API，始终公开。需要 JSON 请求体时，发送 `Content-Type: application/json`。

| 方法及路径 | 请求或响应 |
| --- | --- |
| `POST /products` | 创建商品，返回商品（201）。仅 `name` 和 `category` 必填。 |
| `GET /products` | 返回 `{ products }`。 |
| `GET /products/:productId` | 返回商品详情。 |
| `POST /covers` | 上传原始图片字节（非 multipart），返回 `{ id }`（201）。 |
| `PUT /products/:productId/cover` | `{ coverId }`，关联本人已上传的封面，返回更新后的商品。 |
| `GET /products/:productId/cover` | 按商品读取关联封面的图片字节。 |
| `POST /models` | 上传 `.glb` 3D 模型原始字节（`Content-Type: model/gltf-binary`，最大 20 MiB），返回 `{ id }`（201）。 |
| `PUT /products/:productId/model` | `{ modelId }`（传 `null` 可解绑），关联本人已上传的 3D 模型，返回更新后的商品。 |
| `GET /products/:productId/model` | 按商品读取关联 3D 模型的 `.glb` 字节。 |
| `POST /products/:productId/purchases` | 为该商品创建一条待收货购买记录，返回记录（201）。 |
| `GET /products/:productId/purchases` | 返回 `{ purchases }`。 |
| `GET /purchases/:purchaseId` | 返回购买记录。 |
| `PATCH /purchases/:purchaseId` | 更新待收货记录的金额，返回记录。 |
| `POST /purchases/:purchaseId/receive` | `{ receivedDate }`（`YYYY-MM-DD`），确认收货，返回记录。 |
| `POST /purchases/:purchaseId/cancel` | 无请求体，取消待收货购买，返回记录。 |
| `GET /holdings` | 返回 `{ holdings }`；条目包含 `id`、`productId`、`purchaseId`、`receivedDate`。 |
| `GET /room` | 返回 `{ shareToken, slots }`；私有时 `shareToken` 为 `null`。 |
| `PUT /room/slots/:slot` | `{ holdingId }`，摆放或替换展品；传 `null` 清空。返回 `{ slot, holdingId }`。 |
| `PUT /room/share` | `{ enabled }`（布尔值），返回 `{ shareToken }`。 |

## 商品与封面

可选字段：商品链接 `link`（HTTP(S)，Worker 不访问该链接）、`targetPriceCents`、字符串数组 `tags`、`interestReason`，以及分类专属的 `details` 对象。分类及 `details` 字段如下，各字段均可省略：

- `electronics`：`brand`、`model`、`configuration`、`specifications`。
- `game`：`platform`、`medium`、`edition`、`developer`、`releaseDate`（`YYYY-MM-DD`）。
- `figure`：`work`、`character`、`manufacturer`、`series`、`scale`、`height`、`expectedRelease`（可为季度等文本）。

详情字段均为字符串。商品响应返回 `id`、输入字段、`coverId`、`modelId` 和 `createdAt`。封面上传使用 `image/png`、`image/jpeg`、`image/webp` 或 `image/gif`，最大 5 MiB，并校验文件签名；3D 模型上传使用 `model/gltf-binary`（`.glb`），最大 20 MiB，并校验 glTF 2.0 二进制头部签名。外链与 SVG 不被接受。R2 桶应保持私有；管理 API 仅允许本人读取已关联的封面和模型，公开房间 API 仅允许通过有效分享链接读取当前展品的封面与模型。不自动回收未关联的上传文件。

## 购买与收货

普通购买发送 `{"kind":"regular","shop":"本地店","amountCents":29900}`；预订发送 `{"kind":"preorder","shop":"官方店","depositCents":1001,"balanceCents":2002}`。预订尾款可省略，待收货时再通过 `PATCH` 录入。金额为 CNY 整数分，每个金额字段允许 `0` 至 `1000000000000`；预订 `totalCents` 精确合计已记录的定金和尾款。返回记录含 `currency: "CNY"`、`status`、`receivedDate` 和支付明细。`pending` 可转换为 `received` 或 `cancelled`，两者均为终态。重复确认同一次收货返回原记录，不改变第一次收货日期；只有成功收货才在同一 D1 写入中创建唯一持有物。不同终态间转换返回 `409`。

## 等距房间与公开分享

固定槽位为桌面 `desk-1`、`desk-2`（电子产品），媒体架 `shelf-1`、`shelf-2`（游戏），展示柜 `cabinet-1`、`cabinet-2`（手办）。只有本人已收货且分类匹配的持有物可以摆放；单件持有物只能占一个槽位。不满足这些条件时返回 `409 holding_not_placeable`。每个私有槽位返回 `{ slot, category, exhibit }`，其中空位的 `exhibit` 为 `null`，其他为 `{ holdingId, productId, name, hasCover }`。

- `GET /api/public/rooms/:token` 无需登录，返回 `{ slots }`。槽位同样包含 `slot`、`category` 和 `exhibit`；公开展品仅含 `{ name, coverPath }`（当展品绑定了 3D 模型时额外包含 `modelPath`），没有封面时 `coverPath` 为 `null`。
- `GET /api/public/rooms/:token/covers/:slot` 与 `GET /api/public/rooms/:token/models/:slot` 仅用于读取该房间对应槽位的当前封面或 3D 模型，不接受商品或 R2 对象 ID。房间未分享、链接已失效、槽位无展品或资源不存在均返回 `404`（空的已分享房间仍可访问）。房间、封面和模型均使用 `Cache-Control: no-store`。
- 分享令牌默认不存在。在已经分享时重复开启会保留当前链接；关闭会撤销令牌，重新开启生成新链接。关闭不删除房间布置，也不能收回已保存的副本。

## 生产域名与前端对接

生产配置位于 `wrangler.jsonc` 的 `env.production`。首次 Worker 发布和两条 D1 迁移已完成；正式域名的 Pages/DNS 接入和真实验证码登录仍待验收。

- 前端：`https://shopping.falsita.cn`
- Worker Route：`shopping.falsita.cn/api/*`；其他路径继续由 Pages 服务。前端使用相对路径 `/api/*`，不设置 `VITE_API_BASE_URL`，不访问 Auth 的 token endpoint。
- 接入正式域名时确认 `shopping.falsita.cn` 已绑定到 Pages 且 DNS 已代理。需要更新数据库时运行 `pnpm --filter @order-room/api exec wrangler d1 migrations apply DB --remote --env production`。发布须显式指定 `--env production`；先加 `--dry-run` 检查，发布后验收根页面与 `/api/health` 的路由。

## Falsita Auth：站内验证码 + 24 小时滑动会话

Auth 管理页为本应用配置独立 client：允许站内输入验证码，选择「24 小时活动滑动」，不需要回调、跳转登录或 Passkey。`OIDC_ISSUER` 已设为 `https://auth.falsita.cn`。生产环境需注入 `OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET` 和 `AUTH_SESSION_KEY`（32 随机字节的十六进制编码，64 字符）。可分别运行 `pnpm --filter @order-room/api exec wrangler secret put <NAME> --env production`，不要把值放进前端、Git 或日志。变更加密密钥会使已有本地会话不可读。

| 接口 | 前端约定 |
| --- | --- |
| `POST /api/auth/login` | JSON `{ "code": "012345" }`，也支持 32 位小写十六进制恢复码。成功 `200 { authenticated: true }` 并设置 HttpOnly 会话 Cookie。`401 invalid_code` 提示检查验证码或等待下一枚；`429` 遵守 `Retry-After`；`503` 提示稍后重试。不要自动重交验证码。 |
| `GET /api/auth/status` | 初始化页面或被动检查使用。`200 { authenticated: true }`，`401` 显示登录，`503` 表示暂时无法验证。不会续期。 |
| `POST /api/auth/activity` | 无请求体。仅由真实用户操作触发；合并短时间内的操作，不用于页面加载、心跳、后台轮询或自动重连。成功更新 Cookie 和 24 小时空闲期限。`401` 要求重新登录；`429` 遵守 `Retry-After`，不自动重试刷新。 |
| `POST /api/auth/logout` | 无请求体。`200 { remoteRevoked: true }` 表示已撤销，`null` 表示没有可撤销的本地会话；`503 revocation_unconfirmed` 表示浏览器 Cookie 已清除，但远端撤销未得到确认。 |

用浏览器默认同源凭据即可，不传 Bearer，不读取或保存 Cookie 值。所有 Auth POST 和管理写请求校验精确同源 `Origin`。管理读写请求在线核验授权但不会自动续期；前端应对真实交互调用 `activity`。上游单用户身份为 `owner`，不是多账号系统。Token 仅在后端处理，由 Durable Object 按会话加密持久化并串行轮换；若刷新结果不确定，不重试旧 Token，要求重新登录。

## 身份与本地测试

`src/worker.js` 的 `createWorker({ resolveIdentity })` 是管理 API 的身份边界。应用不信任自报用户 ID。未验证请求返回 `401`，其他用户的数据通常与不存在的数据同样返回 `404`；摆放时非本人的持有物与不存在的持有物同样返回 `409 holding_not_placeable`。

`src/index.js` 是部署入口，使用 Falsita Auth 会话适配器；`pnpm test` 额外使用临时模拟 issuer 和真实的本地 Durable Object 检查登录、并发刷新和撤销。`fixtures/management-worker.js` 仅供 `pnpm test` 和 `pnpm test:e2e` 的本地 Miniflare 测试使用，不参与部署构建。测试自动通过 Wrangler 把迁移应用到临时空库，再由本地 Worker 使用同一份 D1 和临时 R2。浏览器测试服务仅绑定回环地址，测试会话由 Playwright 注入，前端不包含测试凭据。
