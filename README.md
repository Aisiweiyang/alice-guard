# Alice Guard

Secure financial execution and permission layer for AI agents.

> LLM proposes. Deterministic code decides. Wallet policy enforces. Blockchain settles.

当前状态：Phase 4A（Privy 钱包策略 manifest、策略漂移检查、执行信封和并发安全预算预留）。本目录不包含钱包凭据，也不能签名或广播交易；默认保持 `ALICE_GUARD_WALLET_MODE=disabled`。当前 Kuru 测试网 MON/USDC 市场在实测区块没有 ask 流动性，因此 live swap 路径默认阻断。

## Hackathon offline demo

命令行运行三个确定性比赛场景：

```powershell
pnpm demo
```

输出包括允许的小额 swap、超过限额的拒绝、Prompt Injection 拒绝，以及一份本地 SQLite 哈希链审计数据库。该命令使用明确标记的离线证据和模拟 fixture，不连接钱包、不签名、不广播，也不把 fixture 描述成真实链上执行。

启动评委可视化 Web Demo：

```powershell
pnpm demo:web
```

然后打开 `http://127.0.0.1:4173`。浏览器只提交预定义场景 ID，服务端负责意图、风险、策略、Plan Guard 和审计链计算；页面不会接收钱包地址、calldata、合约地址或客户端给出的判定结果。

## Privy Layer-2 policy preview

离线生成确定性的 Privy policy manifest 与规则覆盖矩阵：

```powershell
pnpm privy:policy:render
```

安全检查远端 policy。默认缺少凭据时返回 `NOT_CONFIGURED`，且不会尝试签名或广播：

```powershell
pnpm privy:policy:verify
```

只读远端核验所需的本地环境变量见 `.env.example`。秘密值不得提交到 Git、传给浏览器或写入日志。

## Phase 0 artifacts

- `docs/01-product-vision.md` — 产品定位与原则
- `docs/02-architecture.md` — 推荐架构与信任边界
- `docs/03-threat-model.md` — 威胁模型
- `docs/04-security-model.md` — 双层安全与权限模型
- `docs/05-mvp.md` — MVP 边界与优先级
- `docs/06-tech-stack.md` — 技术栈与仓库结构
- `docs/07-roadmap.md` — 分阶段实施计划
- `docs/08-research-notes.md` — 官方资料研究记录
- `docs/09-open-questions.md` — 待确认决策
- `docs/10-phase1-research.md` — Agent 安全论文与 GitHub 实践研究
- `docs/11-decision-log.md` — 已代为确定的默认工程决策与安全门槛
- `docs/12-phase2-implementation.md` — Intent Parser、来源校验与 Provider 适配说明
- `docs/13-phase3-read-plan.md` — Monad/Kuru 只读核验、ABI 漂移、计划门禁与当前 live blocker
- `docs/14-hackathon-demo-core.md` — 比赛 Demo 编排器、SQLite 审计链与固定演示场景
- `docs/15-demo-web-ui.md` — 评委 Web Demo、API 信任边界、安全展示 DTO 与演示说明
- `docs/16-phase4-privy-research.md` — Privy Layer-2 策略映射、已知限制与安全运行模式
- `src/domain/schemas.ts` — 核心 TypeScript + Zod domain schema 设计稿

## Phase 1 commands

```powershell
pnpm install
pnpm check
pnpm test
pnpm verify:testnet
```

研究基准日期：2026-09-13（Asia/Shanghai）。链配置、协议地址、SDK 接口在实现前必须再次从官方来源核验。
