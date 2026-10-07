# Alice Guard

Secure financial execution and permission layer for AI agents.

> LLM proposes. Deterministic code decides. Wallet policy enforces. Blockchain settles.

2026-10-07：项目已迁移到 `C:\Users\Asus\Desktop\Alice\Alice Guard`，本地依赖链接已修复。比赛收尾进度、验证记录和待提交材料见 [Metropolis 收尾清单](docs/25-metropolis-final-checklist.md)。可双击根目录 `start-demo.cmd` 启动离线演示，然后打开终端显示的本地地址。

交付 ZIP、匹配提交的证据核验、本地更新与 Render 手动部署／回退步骤见 [交付与更新说明](docs/26-delivery-and-updates.md)。从工作区干净的已提交版本运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-delivery.ps1` 可重建经过完整离线验证的交付包。

历史完成状态：Phase 4B-2 已创建专用 Privy Policy 与零余额 EVM 测试钱包，并通过当时的远程回读核验；Phase 4C 提供评委可见的只读状态页和脱敏证据导出。本目录不会提交钱包凭据，也没有交易签名、广播或充值能力；默认保持 `ALICE_GUARD_WALLET_MODE=disabled`。2026-09-15 的只读检查显示 Kuru 测试网 MON/USDC 市场没有 ask 流动性；该记录不是当前链上状态，本轮没有重新核验远端资源。

## Hackathon offline demo

2026-09-18 本地升级：新增 Decision Capsule、服务端原始快照绑定检查、可重放审计快照、Proof View 与离线 Attack Lab，并加固预算状态和持久 nonce。所有 Capsule 均为 `UNATTESTED`；提案通过不代表可执行，签名/广播仍关闭。设计、测试口径和未完成边界见 [2.0 基础版本说明](docs/19-alice-guard-v2-proof-foundation.md)。

运行离线攻击回归（固定输入、每例 100 次，输出 JSON）：`npm.cmd run test:attacks`。不加载 `.env.local`，不访问真实钱包。

新增评委证据包：网页第 06 区域可下载，或运行 `npm.cmd run evidence:judge`。随后用 `npm.cmd run evidence:judge:verify -- "导出的 JSON 路径"` 在单独进程复核。证据包只包含固定离线 fixture（三场景及单遍 51 例），不导出当前会话历史；复核会重新构建本地参考结果，不只检查包内自带哈希。

比赛材料：[三分钟演示流程](docs/20-judge-demo-runbook.md)、[威胁模型](docs/21-v2-threat-model.md)、[提交准备与未核实规则](docs/22-submission-readiness.md)、[可复制的提交文案与视频镜头表](docs/23-submission-kit.md)、[公开演示部署交接](docs/24-public-demo-deploy.md)。签名、广播和充值仍关闭。

命令行运行三个确定性比赛场景：

```powershell
npm.cmd run demo
```

输出包括允许的小额 swap、超过限额的拒绝、Prompt Injection 拒绝，以及一份本地 SQLite 哈希链审计数据库。该命令使用明确标记的离线证据和模拟 fixture，不连接钱包、不签名、不广播，也不把 fixture 描述成真实链上执行。

启动评委可视化 Web Demo：

```powershell
npm.cmd run demo:web
```

然后打开 `http://127.0.0.1:4187`。浏览器只提交预定义场景 ID，服务端负责意图、风险、策略、Plan Guard 和审计链计算；页面不会接收钱包地址、calldata、合约地址或客户端给出的判定结果。

在本机同时展示实时 Privy policy/wallet 绑定与 Monad 余额证明：

```powershell
npm.cmd run demo:web:live
```

该模式只调用 Privy GET 接口和 Monad 公共 RPC。浏览器只接收公开 ID、地址、哈希、布尔核验状态和余额；签名、广播、充值能力仍固定关闭。生成可提交给评委的脱敏 JSON 证据：

```powershell
npm.cmd run evidence:privy
```

## Privy Layer-2 policy preview

离线生成确定性的 Privy policy manifest 与规则覆盖矩阵：

```powershell
npm.cmd run privy:policy:render
```

安全检查远端 policy。默认缺少凭据时返回 `NOT_CONFIGURED`，且不会尝试签名或广播：

```powershell
npm.cmd run privy:policy:verify
```

只读远端核验所需的本地环境变量见 `.env.example`。秘密值不得提交到 Git、传给浏览器或写入日志。

## Privy Phase 4B/4C live evidence

先在本机终端运行隐藏输入配置工具。它把秘密写入 Git 已忽略的 `.env.local`，并将钱包模式保持为 `disabled`：

```powershell
npm.cmd run privy:configure
npm.cmd run privy:owner:verify
```

生成确定性的测试钱包/策略计划及只读负向/撤销计划：

```powershell
npm.cmd run privy:wallet:plan
npm.cmd run privy:wallet:denials
npm.cmd run privy:wallet:revoke:plan
```

已有远端 policy、wallet 和 authorization key ID 后，可运行只读绑定核验：

```powershell
$env:ALICE_GUARD_WALLET_MODE="privy-verify"
npm.cmd run privy:wallet:verify
```

Phase 4B-2 的远端入口是 `privy:wallet:provision`；缺少 `--apply`、精确 confirmation hash 或临时 `privy-provision` 模式时都会拒绝执行。当前公开资源为 policy `mx1nnjw8cs4jlh0hzenclu6q`、wallet `gpqzfry67wit2ef7qajovkot`、地址 `0x73180c3581933490E2108036C8F89b0224B87285`。不要重复 provisioning；使用 `demo:web:live` 或 `evidence:privy` 做只读核验。完整交接见 `docs/17-phase4b-live-privy.md` 与 `docs/18-phase4c-live-privy-status.md`。

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
- `docs/17-phase4b-live-privy.md` — Phase 4B-1 安全准备、只读核验、人工工作和下一阶段门槛
- `docs/18-phase4c-live-privy-status.md` — 评委可见的 Privy/Monad 只读证据、API 边界与运行方式
- `src/domain/schemas.ts` — 核心 TypeScript + Zod domain schema 设计稿

## Phase 1 commands

```powershell
npx.cmd -y pnpm@11.19.0 install --frozen-lockfile
npm.cmd run check
npm.cmd test
npm.cmd run verify:testnet
```

研究基准日期：2026-09-13（Asia/Shanghai）。链配置、协议地址、SDK 接口在实现前必须再次从官方来源核验。
