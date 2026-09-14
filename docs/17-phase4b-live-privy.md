# Phase 4B-1: Privy live preparation without live authority

基准日期：2026-09-14（Asia/Shanghai）。

## Outcome

本阶段把 Alice Guard 从离线策略预览推进到“可审查的远端接入准备”，但刻意不获得资金执行能力。代码只能：

- 生成确定性的 policy/wallet provisioning dry-run 与 confirmation hash；
- 读取既有 Privy policy 和 wallet，核验 policy hash、唯一 policy 绑定、owner 与归档状态；
- 生成 11 个负向用例计划，全部标记为 `NOT_ATTEMPTED`；
- 生成撤销顺序计划，不归档 wallet、不删除 policy、不撤销 key；
- 在本地状态中只保存 public identifiers 和 hash，并拒绝 secret-shaped 字段。

明确禁止：创建或修改 Privy 资源、创建钱包、任意 RPC、消息签名、交易签名、发送交易、导出私钥。所有脚本输出都包含相应的 `false` capability 标记。

## Commands

```powershell
pnpm privy:wallet:plan
pnpm privy:wallet:denials
pnpm privy:wallet:verify
pnpm privy:wallet:revoke:plan
```

默认 `ALICE_GUARD_WALLET_MODE=disabled`。此时计划命令会列出缺失的本地配置，只读核验返回 `NOT_CONFIGURED`，不会发起网络调用。

只读核验要求：

```text
ALICE_GUARD_WALLET_MODE=privy-verify
PRIVY_APP_ID
PRIVY_APP_SECRET
PRIVY_AUTHORIZATION_KEY_ID
PRIVY_POLICY_ID
PRIVY_WALLET_ID
```

秘密必须放在本机 secret store 或当前进程环境中。不得提交 `.env`，不得把 App Secret 或 authorization private key 写入 `data/privy-demo-state.json`、浏览器、日志、截图、测试 fixture 或 issue。

## Your work before Phase 4B-2

你现在不需要提供私钥，也不需要往测试钱包转入任何资产。下一步只需在 Privy Dashboard 做人工准备：

1. 创建一个专用于本次 hackathon 的 Privy App，不复用生产 App。
2. 创建一个专用 authorization key；私钥只留在本机 secret store，记录公开的 key ID。
3. 把 App ID、App Secret、key ID 以本地环境变量方式配置。
4. 运行 `pnpm privy:wallet:plan`，保存公开的 `walletPolicyHash` 与 `confirmationHash`。
5. 把不含秘密的输出交给代码审查；不要执行 `--apply`，Phase 4B-1 会拒绝它。

完成这些以后，Phase 4B-2 才能提出一次“创建一个 policy + 一个空测试钱包”的独立确认。创建前后都要核对 confirmation hash；钱包默认零余额。

## Future Phase 4B-2 gates

远端写入实现不得仅靠命令行 flag 解锁，至少需要：

- 用户对当前 confirmation hash 作明确确认；
- 独立、固定的 provisioning capability，不能复用签名/广播客户端；
- Privy POST idempotency key；
- policy 创建后立即只读回读并比对 canonical hash；
- wallet 必须是 Ethereum 类型、专用 owner、且只绑定一个预期 policy；
- 任一步漂移或 provider error 都停止，不能继续钱包创建；
- public state 原子写入，且绝不落盘 secret；
- 无签名、无广播、无资产充值。

负向测试也不能把“模拟失败”冒充 policy denial。Privy 的交易模拟可能发生在 policy evaluation 之前；只有可归因、可重复、返回明确 policy 拒绝的结果才算证据。任何会产生签名或链上副作用的测试都要另行确认。

## Revocation order

未来撤销必须按顺序执行并逐项确认：确认余额为零、清理 pending action、归档测试 wallet、删除专用 policy、最后在 Dashboard 撤销 authorization key。当前命令只生成这份计划。

## Official references

- Privy policy overview: https://docs.privy.io/controls/policies/overview
- Create policy: https://docs.privy.io/api-reference/policies/create
- Create wallet: https://docs.privy.io/api-reference/wallets/create
- Wallet owners: https://docs.privy.io/controls/authorization-keys/using-owners/overview
- Idempotency keys: https://docs.privy.io/api-reference/idempotency-keys

接口与约束可能变化。进入 Phase 4B-2 前必须再次核对官方文档和锁定的 `@privy-io/node` 版本。
