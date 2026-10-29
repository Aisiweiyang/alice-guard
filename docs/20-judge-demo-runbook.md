# Alice Guard 2.0：三分钟比赛演示

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

适用版本：Decision Capsule / Proof View / Offline Attack Lab 基础版。编写日期：2026-09-18。本文是可照读的演示流程；技术边界见 [V2 Threat Model](21-v2-threat-model.md)。

## 一句话定位

Alice Guard 把 AI 的金融提案转换为可复核的决策记录，在服务端重新核对意图、证据、策略与交易字节，再决定是否接受这个提案。

本次展示的是确定性离线原型。模型输出、报价、余额和模拟结果均来自固定 fixture；没有调用真实 LLM，没有成交，没有签名或广播。Decision Capsule 标为 `UNATTESTED`：它能绑定内容，但不提供数字签名或第三方来源认证。

## 演示前准备

在项目目录打开 PowerShell：

```powershell
cd "alice-guard"
npm.cmd run demo:web
```

打开终端输出的本地 URL，默认是 `http://127.0.0.1:4187`。端口被占用时可让操作系统选择空闲端口，再使用新输出的 URL：

```powershell
$env:ALICE_GUARD_DEMO_PORT = "0"
npm.cmd run demo:web
```

演示不需要 `.env.local`、Privy Secret 或测试币。保留系统状态栏中的 `NO SIGNING`、`NO BROADCAST`、`NO FUNDING`。准备浏览器书签或页面锚点，能快速滚动到 Proof View 和 Attack Lab。

固定回放时钟是 `2026-09-13T00:00:00.000Z`。历史 fixture 的时间可以在这个时钟下有效，不能称为“当前新鲜报价”。同一快照按当前真实时间验证会过期。

## 三分钟操作与中文讲稿

| 时间 | 页面操作 | 讲稿与应看到的结果 |
| --- | --- | --- |
| 0:00–0:20 | 展示 Request、Decision、Plan & Audit 三列与系统状态栏 | “Alice Guard 的目标是让每一个 Agent 金融提案都有可复核的决策依据。今天用固定离线数据展示验证边界，所有钱包执行能力都关闭。” |
| 0:20–0:50 | 选择 `Allowed: bounded 20 USDC swap`，点击 `Run Guard`；查看 Intent、Policy、Plan | “用户明确要求用 20 USDC 买 MON，滑点不能超过 1%。提案通过 schema、来源约束、风险与策略检查后，系统生成精确的 approve 和 swap 计划。这里的 PREPARED 只表示计划准备完成。”应看到已验证计划；Execution 仍为 disabled。 |
| 0:50–1:15 | 滚到 Proof View，展开一项 Evidence provenance，查看 capsule 与 hash bindings | “这个 Decision Capsule 绑定请求、意图、证据、完整策略、模拟和交易计划。来源写明 OFFLINE_FIXTURE，签名状态是 UNATTESTED。服务端会用原始上下文重新核对这些内容，PROPOSAL CHECKS PASSED 不等于钱包授权。” |
| 1:15–1:50 | 在 Attack Lab 选 `Rehashed plan and resealed capsule`，点击 `Run offline test` | “现在攻击者替换交易目标，同时重算计划哈希和 Capsule。仅检查哈希自洽是不够的：服务端原始上下文没有变，因此候选被拒绝。”应看到 `DENY`、`PLAN_BINDING_MISMATCH`、`CASE ASSERTIONS PASSED` 和 `WALLET NOT REACHED`。此用例 ID 为 `plan-rehashed-resealed`。 |
| 1:50–2:05 | 选择 `Consistent 20 USDC proposal`，运行 | “对照组保留合法输入，同一个 verifier 允许它通过。这样可以确认演示不是无条件拒绝。”应看到 `ALLOW` 与 `CASE ASSERTIONS PASSED`；`executionAuthorized` 仍为 false。用例 ID 为 `benign-20-usdc`。 |
| 2:05–2:30 | 回到 Request，依次运行 `Denied: transaction exceeds 100 USD`、`Denied: policy-bypass prompt injection` | “5000 USDC 请求在策略层被拒绝，没有建立交易计划。注入示例更早在意图层停止，风险、策略和计划没有继续运行。这两个路径都留下审计记录。”前者可以有 DENY Capsule；后者没有可信意图，因此不会伪造 Capsule。 |
| 2:30–2:45 | 指向 Live Privy Guard 与 Layer 2 · Privy Policy | “Privy 集成提供钱包策略 manifest 和独立的只读远端绑定检查。离线页面可能显示 NOT CONFIGURED；实时读失败会显示 DEGRADED。我们不会把离线 coverage 当作一次真实的 Privy 拦截。” |
| 2:45–3:00 | 回到 Attack Lab 或证据报告摘要 | “固定套件包含 41 个恶意用例和 10 个合法对照。我们把场景、原因码与回放材料交给评委复核。下一阶段再完成真实数据认证、审批身份和原子执行状态接线。”只引用本次实际报告中的通过数。 |

注入场景的精确限制：主页的 injection 示例使用固定 provider 返回的 reject；它展示的是早停路径，不能证明一个真实 LLM 能稳定识别注入。Attack Lab 的 parser 用例会给真实 parser 传入固定的恶意结构化提案，测试 schema 与 request-origin 边界，同样不是在线 LLM 红队结果。

## 可直接使用的英文 Pitch

> Alice Guard is a financial proposal firewall for AI agents. It turns a proposed action into a Decision Capsule binding the user request, evidence, policy, simulation and exact transaction plan. The server checks that proposal against its original context and recomputes deterministic decisions. In this demo, an attacker changes the target and recalculates both hashes. The proposal is still rejected because the trusted context did not change. A legitimate control passes the same verifier. Our current prototype uses fixed offline fixtures, never signs or broadcasts, and labels every capsule UNATTESTED. Privy wallet-policy coverage and optional read-only binding checks are shown separately. We provide reproducible attack cases and decision records so judges can inspect what passed, what failed and why.

## 证据包和两种验证

评委证据包的默认工作流：

```powershell
npm.cmd run evidence:judge
```

复制命令输出的 JSON 文件完整路径。在另一个终端、同一项目目录运行下列命令；用实际路径替换占位符后再执行：

```powershell
npm.cmd run evidence:judge:verify -- "<导出命令输出的 JSON 完整路径>"
```

这是一份固定离线数据的**单遍 51 例报告**与历史决策材料。导出和复核都不能授权交易。新的进程复核能排除只依靠原进程内存显示成功的演示问题；它仍使用本仓库的实现和信任假设，不是独立第三方认证。

导出程序仅从仓库内置 fixture 构建材料，输出到 `demo-output/judge-evidence-*/judge-evidence.json`，不读取现有用户审计库、`.env.local` 或 Privy 状态。成功摘要为 `status: EXPORTED`、`selfCheck: VERIFIED`。复核程序从当前源码重新构建参考材料，并比较场景、审计链、攻击结果、指标与包哈希；还会重放正常与超限场景。成功结果应为 `status: VERIFIED`、空 `reasonCodes`，并始终有 `executionAuthorized: false`。退出码非零或 REJECTED 都是失败。

记录生成证据时的源码版本并使用对应版本复核。fixture 或算法发生变化后，旧包可能不再匹配新版本的参考结果；这不能通过手工修改包哈希解决。`packHash` 是内容标识，不是发布者签名。

需要展示重复确定性时，单独运行：

```powershell
npm.cmd run test:attacks
```

此命令每个固定用例运行 100 次：51 个用例共 5,100 次运行，后续 99 次与首个结果比较，共 5,049 次比较。不要将单遍证据包描述为已经执行了这一轮重复测试。

解释指标时明确分母：

- `falseAllowCount`：41 个固定恶意案例中被错误允许的数量。
- `falseDenyCount`：10 个固定合法对照中被错误拒绝的数量。
- `passed`：不仅要求 verdict 符合预期；恶意用例还要出现预期原因码。
- `unsafeExecutionCount=0`：离线 runner 没有执行器，结构上不可能调用钱包；这不是实际钱包资金安全的统计证明。
- `deterministicReplayMatchRate`：固定输入的重复结果比较，不代表对未知输入或未来行情的稳健性。

网页每次运行会生成新的 request ID 和审计记录，所以两次按钮点击的 Capsule hash 可以不同。只有输入材料、ID、时钟与状态均相同，才应该要求相同哈希。

## 常见追问和诚实回答

**“这已经在 Monad 上成交了吗？”** 没有。本轮是支持 Monad Testnet / Kuru 交易形状的离线计划与验证演示。独立 Privy 状态卡可以执行只读查询，但没有签名、广播或成交。

**“谁证明 Capsule 是真的？”** 本版本依赖服务端保存的原始上下文和本地代码；哈希能检测相对这些基准的变化。没有数字签名或外部锚定，完整替换服务端、代码及数据的攻击不在当前保证之内。

**“有完整的抗 prompt injection 能力吗？”** 当前展示严格结构化提案、字段来源校验和候选绑定。自然语言来源检查支持有限语法，尚未对真实模型、未知攻击和广泛正常请求做泛化评测。

**“Privy_ENFORCED 是否等于这个攻击已经被 Privy 拒绝？”** 不等于。这个标签来自策略编译器的约束映射。实时绑定检查与远端拒绝实验是不同证据，当前攻击实验室没有调用 Privy。

**“为什么合法结果也不执行？”** 当前只有提案验证，默认 PROPOSE_ONLY。审批身份、nonce 消费、预算预留与真实 signer 尚未组成完整的原子执行协议。

## 演示异常时

- Attack Lab 显示 `UNAVAILABLE`：报告此次没有有效测试结果。检查本地服务后重新运行，不把错误页计为拦截通过。
- Privy 为 `DEGRADED`：讲明只读核验暂不可用，继续固定离线演示，不修改验证门槛。
- 正常场景出现 `PROPOSAL BLOCKED`：保留原因码，使用命令输出定位；不要只展示预期截图或删除失败记录。
- 证据包复核失败：先保留原包，报告失败原因；修复后重新导出并复核，不手工修改报告数字。
- 现场不打开 `.env.local`、私钥、Secret 或授权 Key 页面；本次演示无需这些信息。

## 代码定位

演示场景与固定时钟：`src/demo/demo-template.ts`。攻击定义：`src/demo/attack-lab.ts`。Capsule：`src/domain/decision-capsule.ts`。提案验证：`src/application/pre-execution-verifier.ts`。审计历史回放：`src/application/replay-decision-proof.ts`。HTTP 边界：`src/server/demo-server.ts`。
