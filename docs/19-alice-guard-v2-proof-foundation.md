# Alice Guard 2.0 — 可复核决策与离线攻击实验

实施日期：2026-09-18。阶段 A–D 的本地基础版本；不是生产执行器，不声称已经满足比赛所有要求。

## 定位与边界

从“三个固定演示场景”推进为“有完整输入快照、独立检查和可复现实验的 Agent 决策防护层”。LLM 只能提出结构化意图；服务端保存原始决策上下文，候选计划不得替换它。所有新功能均为离线 fixture，默认 `PROPOSE_ONLY`，始终 `executionAuthorized=false`，没有新增签名、广播、充值、远端策略创建或撤销入口。

Decision Capsule 是哈希承诺，不是数字签名、远端证明或形式化安全证明。`UNATTESTED` 必须可见。攻击者修改候选并重新计算全部候选哈希，仍会在与服务端原始快照比较时失败；如果服务端本身、数据库及其可信上下文被完整替换，本版本不提供密码学上的来源认证。

## 阶段 A：复用与缺口

| 能力 | 实施前 | 本次 | 仍未完成 |
| --- | --- | --- | --- |
| 意图约束、金额来源校验 | 已有严格 schema、有限语法来源检查 | 复用真实 parser 作为攻击边界 | 通用自然语言理解、真实 LLM 红队基准 |
| 风险与应用策略 | 已有确定性评估引擎 | 重新计算结果、绑定完整策略定义和证据 | 新风险算法实证、真实行情校准 |
| calldata / 模拟 | 已有 Plan Guard | Capsule 绑定实际交易字节、模拟、envelope | 新鲜真实链上模拟、实际成交 |
| 审计 | SQLite 追加与哈希链 | 保存完整 Capsule 和可重放的输入 JSON 快照 | 外部可信锚定、防整库重写 |
| 预算 | 预留状态机 | 修复终态重放、待对账占用、时间/精度；真实并发测试 | 预算与 signer 的完整原子执行协议 |
| nonce | 内存去重 | 新增 SQLite 持久去重、重启测试 | 真正执行边界上的原子消费接线 |
| 评委页面 | 三场景、只读 Privy 状态 | Proof View、allowlisted Attack Lab | 真实交易结果与比赛录屏 |

## 阶段 B：数据及信任路径

`request → grounded intent → evidence + provenance → risk/policy → plan + simulations → envelope → capsule → proposal verifier → append-only audit`

关键文件：

- `src/domain/decision-capsule-shape.ts`：独立严格 schema，避免审计模型循环依赖。
- `src/domain/decision-capsule.ts`：完整材料 schema、规范化哈希、Capsule 生成。
- `src/application/decision-proof.ts`：服务端在输出候选前保存独立快照。
- `src/application/pre-execution-verifier.ts`：候选与可信材料逐项比较、重新计算、来源/有效期/状态检查。
- `src/application/replay-decision-proof.ts`：严格解析持久快照、验证审计记录与快照绑定后做历史重放。调用者需提供明确的历史或当前时间；历史通过不代表当前可执行。

Capsule 同时承诺请求、意图、证据根、风险配置、完整应用策略、钱包策略 manifest、计划、模拟、审批、envelope、时间与 nonce。旧 `policy.configHash` 不是完整策略内容的计算哈希，因此新增 `policyDefinitionHash`，不能仅相信调用方附带的旧标签。

演示证据全部标为 `OFFLINE_FIXTURE / FIXTURE_ONLY`，即使旧 fixture 中 source 字段是 rpc/dex，也不会展示成真实链验证。`PRIVY_ENFORCED` coverage 表示 manifest 编译器的映射能力，不代表这个离线记录的远端绑定已经验证。实时只读状态保持独立，不能混入 fixture 形成伪真实证明。

`verification.ok` 表示整个提案检查通过，包括策略与状态门禁；合法的 DENY 记录仍可能显示检查拒绝。它不是纯哈希验证结果，更不是钱包授权。执行模式固定返回 `UNATTESTED_CAPSULE / EXECUTION_NOT_IMPLEMENTED`。

固定演示时间为 `2026-09-13T00:00:00.000Z`；页面明确说明它不是当前时间。相同快照按当前真实时间验证将因过期被拒绝。

预算存储和 nonce 存储均为独立可测试组件。当前 verifier 接收服务端状态快照，尚未把这两个存储组成 live executor 的原子边界。未来任何 signer/broadcast 必须在外部动作之前持久化执行中或待对账占用；未知广播状态不得自动释放预算。进程异常和链上重组也需要单独对账设计。

## 阶段 C：Attack Lab

`GET /api/attack-lab` 只列固定用例；`POST /api/attack-lab` 只接受 `{caseId}`。客户端不能提交 trusted context、任意脚本、calldata 或 skipVerification。页面和 CLI 调用相同测试边界。

用例覆盖严格输入、金额和滑点替换、伪造权限/metadata/tool output、候选重封装、策略漂移、证据标签提升、目标/selector/value 替换、模拟替换、审批伪造、nonce 重放、过期、暂停/急停、服务不可用，以及不同金额的合法对照。每个攻击除了 DENY，还要出现预期原因码，防止通用错误造成假通过。

这些是合成结构化输入回归测试，不是对真实 LLM 或未知提示注入的防护率评测；metadata/tool-output 用例只证明未知字段或来源绑定边界，没有实现通用注入检测模型。

```powershell
cd "C:\Users\Asus\Desktop\Alice\Alice Guard"
npm.cmd run check
npm.cmd test
npm.cmd run test:attacks
npm.cmd run demo:web
```

`test:attacks` 输出 JSON；每例固定输入运行 100 次。`attackBlockedRate`、`benignCompletionRate` 的分母是该合成用例集合。`unsafeExecutionCount=0` 由离线 runner 无执行器的结构保证，不能拿它冒充实际钱包安全测试。`falseAllowCount` 才是这组攻击漏放的观察值。

## 阶段 D：Proof View

页面展示 Capsule 哈希、策略判定、提案检查、证据来源、规则覆盖和边界说明。Attack Lab 展示实际 mutation、拦截边界、原因码、期望/实际结果。所有用户可见字段使用安全文本节点，保留 CSP；不增加 HTML 注入或钱包执行按钮。

## 本次验证记录

- TypeScript：通过。
- 全量离线回归：35 个测试文件、307 项测试通过。
- Attack Lab：41 个恶意用例、10 个合法对照；每例 100 次，共 5,100 次运行和 5,049 次重复比较；固定用例无误放/误拒且结果一致。
- 浏览器：正常提案 Proof View、重新计算计划及 Capsule 哈希后的目标篡改拒绝、合法对照通过；窄屏检查无页面级横向溢出。
- 上述均不构成生产安全认证或真实链上执行证明。

## 下一阶段门槛

1. 先整理 Threat Model 与 3 分钟比赛演示，说明哪些是真实能力、哪些是离线实验。
2. 为 live 数据适配器建立签名来源/可信 RPC、更新区块和时间绑定；独立核验新鲜远端 Privy policy 与 wallet binding。
3. 完成审批授权身份与一次性消费、预算与 nonce 原子状态转换、失败/重启/未知广播对账。
4. 专门设计并审查最小测试网执行阶段，再由用户明确批准签名与测试资产使用。本次不触发这些动作。

本次没有复制第三方项目代码、增加新算法依赖或宣称复现论文结果；前期研究记录继续见 `docs/10-phase1-research.md` 与 `docs/16-phase4-privy-research.md`。
