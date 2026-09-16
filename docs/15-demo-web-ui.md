# Phase 3.6 — Judge-facing Demo Web UI

## 目标

提供一个评委可直接操作的本地 Web 界面，把 Alice Guard 的核心价值压缩成一条可观察的安全流水线：

`不可信请求 → 结构化意图 → 风险评估 → 确定性策略 → Plan Guard → 哈希链审计`

默认命令是离线比赛演示；Phase 4C 另提供实时、只读的 Privy 状态面板。两种模式都明确保持以下执行能力关闭：

- OFFLINE DEMO
- NO WALLET EXECUTION
- NO SIGNING
- NO BROADCAST
- EXECUTION NOT ATTEMPTED

## 运行

```powershell
pnpm demo:web
```

默认地址为 `http://127.0.0.1:4173`，只监听本机回环地址。需要避开端口冲突时可设置 `ALICE_GUARD_DEMO_PORT`。

## 评委演示流程

界面提供三个固定场景：

1. **Allowed: bounded 20 USDC swap**：意图通过，风险为低，策略允许，Plan Guard 生成并验证 approve + swap 两步计划；不签名、不广播。
2. **Denied: transaction exceeds 100 USD**：意图有效，风险升高，确定性规则因为单笔限额、滚动限额和人工批准门槛拒绝；不创建交易计划。
3. **Denied: policy-bypass prompt injection**：包含绕过策略和恶意转账指令，在可信意图形成之前拒绝；风险、策略和计划阶段均不运行。

## 架构

- `scripts/serve-demo.ts`：启动本地 HTTP 服务和独立 SQLite 审计文件。
- `src/server/demo-server.ts`：Node 内置 HTTP 服务、路由、请求体限制、响应头和错误边界。
- `src/server/api-schemas.ts`：浏览器请求与安全展示响应的严格 Zod schema。
- `src/ui/presentation.ts`：将内部 Demo 结果投影为最小、安全、可展示的 DTO。
- `src/ui/index.html`、`styles.css`、`app.js`：无框架、无 CDN 的本地界面。

## API 信任边界

浏览器不是决策者。`POST /api/demo` 只接受：

```json
{"scenario":"allowed-small-swap"}
```

请求 schema 使用 strict 模式。未知场景、额外字段、钱包地址、合约地址、calldata、客户端指定的 `allow` 或 `status` 均被拒绝。请求体限制为 2 KB。

服务端依据场景 ID 选择本地 fixture，并独立执行完整 Demo Core。浏览器不能改变策略、证据、计划或结果。

可用端点：

- `GET /api/health`：返回本地服务状态和全部关闭的执行能力。
- `GET /api/scenarios`：返回可选场景的只读描述。
- `POST /api/demo`：运行一个 allowlist 场景并返回安全展示 DTO。
- `GET /api/audits`：返回最小审计摘要，不暴露数据库路径或原始记录。

## 安全展示 DTO

API 只返回评委需要检查的语义信息：

- 结构化意图摘要
- 风险分数、等级和原因码
- 策略判定、规则轨迹和原因码
- 交易计划的目标、金额、gas 上限和业务语义
- 计划哈希、审计哈希、前序哈希和链校验状态

以下内容不会进入浏览器响应：

- 原始 calldata
- 钱包私钥、助记词或签名材料
- 本地 SQLite 路径或原始数据库内容
- 服务端异常堆栈
- 可伪装成链上成功的交易哈希或区块浏览器链接

## 防护与验证

- 只监听 `127.0.0.1`。
- 静态文件使用精确 allowlist，不提供目录浏览。
- 设置 CSP、`X-Frame-Options: DENY`、`nosniff`、no-referrer 和 no-store。
- 前端使用 `textContent` 和 DOM API 渲染，不使用 `innerHTML`、`eval` 或 `document.write`。
- 每次运行使用唯一 request/audit ID，并追加到同一条 SQLite 哈希链。
- 自动化测试覆盖严格请求边界、安全错误、无路径泄漏、无 calldata 泄漏、三条早停路径和重复场景的审计链连续性。

## Fixture 与 live 状态

Web Demo 使用确定性的离线 evidence/quote fixture，只用于展示 Alice Guard 的决策和安全边界。它不会声称读取了当前链上状态，也不会把计划描述为已执行交易。

现有 live read-only 核验仍由 `pnpm verify:testnet` 负责。当前 Kuru 测试网 MON/USDC 市场曾观察到无 ask 流动性，因此真实 swap 计划必须继续 fail closed。

## 已知限制与 Phase 4 入口

- `pnpm demo:web` 不读取 Privy；`pnpm demo:web:live` 只读核验已创建的专用 Privy policy/wallet。
- 当前没有用户 session、签名、广播、交易回执或资金托管。
- 当前没有公网部署；演示服务器只用于本机比赛展示。
- 实时面板不改变离线场景的 evidence，也不会把 fixture 伪装成链上执行。真实资金路径仍需单独完成权限、重放、额度、仿真和回执审查。
