# 使用说明

按 README 安装后运行 `npm run demo:web`，打开终端地址，无需环境文件。固定用例采用 2026-09-13 的合成时钟，页面时间不是当前市场时间。

1. 选择 20 USDC、超限或注入场景，运行 Guard，查看拒绝路径及早停位置。
2. 在 Proof View 检查 Capsule 绑定和来源标签。
3. 在 Attack Lab 选择变体或正常对照，比较期望与实际判断。
4. 导出证据，用可信本地代码执行 `npm run evidence:judge:verify -- "<JSON 路径>"` 重建结果。

`npm run demo` 是命令行演示；`test:attacks` 是 100 次重复回归，Web 与导出是单遍，不能混作同一指标。

## 产物与错误

产物在忽略的 `demo-output/` 下。每次启动创建新目录，旧记录保留。迁移源码后重新安装依赖，不复制 `node_modules`。

| 返回码/错误 | 处理 |
|---|---|
| `400 INVALID_DEMO_REQUEST` | 只允许固定场景 ID |
| `400 INVALID_REQUEST_TARGET` | 使用支持的站内路由 |
| `403 CROSS_ORIGIN_REQUEST` | 从演示页面或命令行访问 |
| `413 REQUEST_TOO_LARGE` | 请求体不超过 2,048 字节 |
| `415 CONTENT_TYPE_REQUIRED` | 使用 `Content-Type: application/json` |
| `429 DEMO_BUSY` / `ATTACK_LAB_BUSY` | 稍后重试 |
| `429 DEMO_CAPACITY_REACHED` | 重启创建新会话，旧数据库保留 |
| `500` / `503` | 本次失败，不能推断已通过或已执行 |

默认上限为 1,000 条审计、4 个并发场景、2 个并发攻击。`GET /api/audits` 返回最近 50 条摘要、总数、是否截断和完整链状态。配额只能由服务端构造参数改变。

## 可选接口

快速开始不调用远端 API。`verify:testnet` 是另外运行的只读链核验，需要网络。模型适配器只解析有限意图，使用者自行提供配置和预算。

Privy 命令见技术文档 16–18。`demo:web:live` 只展示筛选后的只读状态；`privy:wallet:provision` 可以创建远端 policy 和钱包，是独立命令及授权边界。不要为体验离线演示运行 provisioning，不给演示钱包充值。

`demo:web:public` 监听所有网卡，拒绝 Privy 凭据，公网使用需另加访问控制和速率限制。公开仓库不等于已经部署公网演示。
