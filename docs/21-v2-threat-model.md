# Alice Guard 2.0 威胁模型

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

日期：2026-09-18。范围：当前 Decision Capsule、服务端提案验证、固定离线 Attack Lab、SQLite 审计/状态组件，以及独立的 Privy 只读状态卡。与 [架构及实现记录](19-alice-guard-v2-proof-foundation.md) 和 [评委演示流程](20-judge-demo-runbook.md) 配套阅读。

这是原型的威胁边界和证据说明，不是安全审计认证、经济风险保证或生产就绪声明。当前没有可用的真实交易执行器。

## 保护目标与资产

| 资产 | 保护目标 | 当前落实方式 |
| --- | --- | --- |
| 用户请求的金额、资产和滑点意图 | 模型提案不能悄悄扩权 | 严格 proposal schema；有限语法的 request-origin 校验；服务端上下文绑定 |
| 策略定义、风险配置与评估结果 | 候选不能替换规则或篡改判定 | 完整材料快照；完整策略定义哈希；重新计算风险与策略 |
| 证据、来源标签、报价、模拟 | 不能靠改标签、旧数据或替换模拟让候选通过 | 引用与类型检查、哈希绑定、时间检查、固定来源类型约束 |
| 目标合约、calldata、金额、value、chain、wallet | 提案必须与已检查的精确计划一致 | Plan Guard 重新解码；envelope 与 Capsule 绑定 |
| 审批和执行状态 | 缺失状态不能被当作授权 | 审批绑定；状态门禁；execution 模式无条件不授权 |
| 预算占用、nonce 与审计记录 | 检测重放、并发超占和记录变化 | SQLite 独立组件与测试；审计哈希链和快照回放 |
| Privy 凭据 | 不进入浏览器、API 响应或测试 fixture | 后端读取、窄接口、安全错误摘要；离线演示无需凭据 |
| 潜在钱包资金 | 当前演示不产生钱包动作 | 无签名/广播依赖的离线 runner；DisabledPrivyWalletBoundary 拒绝执行 |

未来若启用 signer，“钱包资金”会变为直接受影响资产，必须重新评估整个威胁模型。

## 信任边界

1. **浏览器 → 本地 HTTP API。** 浏览器为非授权输入来源。`POST /api/demo` 只收 allowlisted scenario；`POST /api/attack-lab` 只收 allowlisted caseId。未知字段、原始 calldata、trusted context 与跳过验证参数不可由该 API 注入。请求体受 JSON 类型和 2,048 字节限制。页面使用文本节点和 CSP。
2. **Provider 提案 → Intent parser。** Provider 输出视为不可信。当前 demo provider 是固定 fixture，攻击 runner 可返回被污染的结构化 proposal；它们都经过同一 parser。仅候选金额与滑点等受限字段可进入后续逻辑，不允许任意钱包调用。
3. **服务端快照 → Candidate。** `createOfflineDecisionProof` 在输出候选前克隆原始材料。verifier 同时接收 candidate 与服务端 trusted，并逐项比较。candidate 自己重算哈希不能改变原始快照。该前提要求服务端进程与上下文仍可信。
4. **Evidence → 安全事实。** 当前材料只支持 `offline-fixture`；provenance 必须是 `OFFLINE_FIXTURE / FIXTURE_ONLY / fixture`。schema 中存在其他来源枚举，不表示 live provenance 已接入；当前 verifier 不会把它们自动当可信来源。
5. **策略评估 → 精确计划。** 风险分数是解释和策略输入的一部分，不能独立产生钱包权限。Plan Guard、envelope 与 Capsule 要求目标、交易字节、模拟和上下文一致。
6. **提案检查 → 钱包动作。** `verification.ok` 是提案门禁结果。`executionAuthorized` 固定为 false；execution 模式加入 `UNATTESTED_CAPSULE`、`EXECUTION_NOT_IMPLEMENTED` 等拒绝码。没有通过 UI 开启执行的路径。
7. **本地配置 → Privy/RPC 读取。** 可选实时卡独立读取远端 policy/wallet 与 Monad 余额。网络失败显示 unavailable/degraded；它不提升离线 fixture 的可信等级，也不自动开启执行。
8. **运行内存 → SQLite/导出材料。** 本地哈希链和快照能检测相对记录的修改，并支持复核。存储与代码不是外部可信锚点；攻击者若能完整替换数据库、代码和基准，当前哈希体系不能认证历史真实性。

## 攻击者能力与假设

纳入固定用例的能力包括：返回恶意模型 proposal、添加未知权限字段、替换金额/目标/selector/native value、改证据/模拟/策略、提升 provenance 标签、伪造 approval、修改候选后重新计算哈希，以及让可信状态快照报告过期、nonce 已消费、暂停、政策漂移或服务不可用。

verifier 的可信输入和选项由服务端提供；它们不能由 HTTP 调用者同候选一起提交。即便 candidate 与 trusted 一致，仍会检查证据引用、事实一致性、时间和确定性重计算，避免把一个内部自相矛盾的快照直接当成有效提案。

当前默认信任运行本地服务的操作系统、项目代码、依赖与初始配置。未声明抵抗操作系统入侵、依赖供应链植入、管理员任意改库、可信服务本身恶意返回一致伪数据或完整替换原始请求。哈希和类型检查无法单独建立这些来源的真实性。

## 已实现控制、可见证据和余下风险

| 威胁 | 当前控制/验证证据 | 未覆盖或必须保留的限定 |
| --- | --- | --- |
| 模型追加 recipient、chain、calldata、metadata 权限 | proposal 严格 schema；Attack Lab `proposal-*` 用例 | metadata 被拒绝为未知字段，不是识别任意 metadata 语义中的恶意指令 |
| 金额或滑点被模型替换 | request-origin 与 decimal 处理；`proposal-amount`、`proposal-slippage` | 正则及受限语法可能误拒复杂表达；没有通用用户意图理解证明 |
| 提示注入和工具输出污染 | 固定 parser 攻击与字段/来源绑定 | 没有真实 LLM 或浏览器代理攻击环境；不可推导未知 prompt injection 防护率 |
| 重封装的计划篡改 | 与 trusted material 比较、重新生成 Capsule、Plan Guard；`plan-rehashed-resealed` | 如果 trusted 基准与代码一并被替换，不能靠自洽哈希检测来源造假 |
| 风险/策略结果伪造 | 绑定完整定义和 facts，重新计算评估结果 | 配置本身是否符合用户预期仍属部署信任；风险模型没有市场实证校准 |
| 证据标签提升、引用错位 | provenance 一一对应、content hash、kind、quote 与事实一致性检查 | fixture 的数值不由外部数据源认证；其他 live 信任类别尚未接线 |
| 过期/未来时间与状态变化 | 固定 verifier 时钟、观察时间、quote/Capsule expiry、configured max age 检查 | 演示采用历史时间；尚无实时链重组、RPC 分叉与 TOCTOU 执行协议 |
| 任意合约、spender、selector、value | Plan Guard + 编译后的 Privy manifest；mutation 测试 | 本地 manifest preview 不等同 Privy 远端拒绝；协议合约漏洞和 MEV 未消除 |
| Approval 替换 | approval 与材料/计划绑定，approval-required 状态拒绝 | 尚未实现真人身份认证、审批签名与一次性消费；不存在完整 live 审批授权 |
| nonce 重放 | verifier 拒绝 CONSUMED/UNAVAILABLE；SQLite nonce 跨连接/重启测试 | 当前提案 fixture 的 nonce 状态是固定快照；没有与 signer 原子消费接线 |
| 并发预算超占/不确定广播 | SQLite 预留状态与多连接并发测试；不确定状态持续占用 | 独立存储正确性不等于完整执行协议；尚未与真实广播、nonce 形成同一边界 |
| Privy/RPC 超时或策略漂移 | 只读状态降级；提案状态用例明确拒绝 unavailable/drifted | 离线 proposal 允许 NOT_CONFIGURED，但不授权执行；不能称为远端验证已通过 |
| 审计记录改写 | 追加记录、哈希链、材料快照和历史回放 | 无外部时间戳/签名锚定；整库重写、截断及代码替换的来源认证未解决 |
| Secret 泄漏与错误堆栈 | 受限 DTO、安全错误码、API 边界测试；UI textContent | 不等于所有系统日志/依赖均已独立审计；不要将本地敏感配置打包 |
| API/UI 滥用 | allowlisted IDs、严格请求体、localhost 绑定、CSP | 本地演示无多用户认证、配额或完整 DoS/审计磁盘容量保护，不适合直接公网生产部署 |

Privy coverage 的分工：链、合约、selector、token、spender、输入 raw amount 上限和 native value 等映射到远端 manifest；recipient 语义、精确金额等值、quote-relative slippage、USD/rolling 限额、freshness 和 human approval 仍有应用层责任。`PRIVY_ENFORCED` 仅声明编译器的映射层，必须另行核验远端 binding 和拒绝行为，不能从标签推导所有约束都有密码学强制。

## 失败语义与证据解释

- `ALLOW`：当前提案在指定历史/固定上下文下通过；不是签名许可。
- `DENY`：政策、来源、结构、时间或状态拒绝；合法的 DENY Capsule 可以是有效审计记录。
- `UNATTESTED`：没有数字签名、硬件证明、零知识证明或链上证明。
- `NOT_CONFIGURED`：离线提案未配置远端核验；提案可以离线演示，执行不能由此获准。
- `UNAVAILABLE / DEGRADED`：没有可靠的实时检查结果；不能拿超时、模拟失败或 API 错误冒充 Privy 政策拒绝。
- 审计回放：检查持久快照与记录的绑定，并在调用者明确给定的时钟/状态下运行 verifier；历史通过不代表现在可以执行。
- 评委证据包：固定离线材料的导出和独立进程复核。复核器用当前可信源码重新构建基准，比较场景、攻击结果、指标与包哈希，而不是只相信包内自己带来的 trusted 字段。`VERIFIED` 意味着与这一版本的离线基准可复现一致；不是对第三方来源或真人行为的认证。

## 测量边界

Attack Lab 当前包含 41 个固定恶意用例、10 个固定合法对照。单遍 51 例报告说明这组输入的表现；`test:attacks` 每例 100 次的 5,100 次运行说明固定输入下的重复确定性。两者必须分开记录。

这些测试没有真实模型随机性、未知攻击分布或经济损失实验。`unsafeExecutionCount` 在无执行器的 runner 中结构上为零；需要观察的回归信号是漏放数量、误拒数量、特定原因码断言和重复哈希。所有通过率只能针对实际执行的固定用例分母。

完整 UI、API、存储和 verifier 回归使用同仓库测试；这提供可复现的工程证据，但不是独立安全审计或形式化验证。新增功能后应重新执行测试，不沿用过往测试数量作为本次结果。

## 进入真实执行前的必要工作

1. 定义 live 数据适配器的来源认证、区块一致性、价格来源、新鲜度与故障策略，不提升 fixture 信任标签冒充 live 数据。
2. 把人类审批身份与精确计划绑定；设计撤销、过期和一次性消费，核验真实 Privy owner/signers/policy。
3. 将 nonce、预算和执行生命周期持久状态接到唯一 signer 边界；明确崩溃重启、未知广播、重试和对账的不变量。
4. 设计调用前与发送前的状态复核、模拟与 TOCTOU 约束，处理 RPC 分歧、链上重组和合约变化。
5. 建立外部审计锚定或签名来源后，再描述相应认证能力；历史材料仍需明确时钟语义。
6. 分别评估真实模型攻击与正常用户任务，补充误拒、未知攻击、超时和资源滥用测试。
7. 为最小测试网交易制定具体范围与回退/对账方案，再由用户批准测试资产使用与签名。本文不授权这些动作。

## 代码与测试索引

- Schema / hashes：`src/domain/decision-capsule-shape.ts`、`src/domain/decision-capsule.ts`、`tests/unit/decision-capsule.test.ts`。
- 权限输入：`src/application/parse-request.ts`、`src/application/request-origin-guard.ts`。
- 提案核验：`src/application/decision-proof.ts`、`src/application/pre-execution-verifier.ts`、`tests/security/pre-execution-verifier.test.ts`。
- 精确计划：`src/application/plan-guard.ts`、`src/domain/execution-envelope.ts`。
- 审计回放：`src/application/replay-decision-proof.ts`、`tests/integration/decision-proof.test.ts`。
- 预算/nonce：`src/adapters/audit/sqlite-spend-reservation-store.ts`、`src/adapters/audit/sqlite-execution-nonce-store.ts`及对应 integration tests。
- Privy 分工：`src/adapters/privy/privy-policy-compiler.ts`、`src/adapters/privy/disabled-privy-client.ts`、`src/application/privy-judge-status.ts`。
- HTTP/攻击实验：`src/server/demo-server.ts`、`src/demo/attack-lab.ts`、`tests/security/demo-api-boundary.test.ts`。
- 评委证据包：`src/application/judge-evidence.ts`、`src/domain/judge-evidence.ts`、`scripts/export-judge-evidence.ts`、`scripts/verify-judge-evidence.ts`。
