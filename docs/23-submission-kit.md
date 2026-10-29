# Alice Guard 2.0 — 提交文案与交接包

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

更新日期：2026-09-27。此文案供比赛提交页和演示视频使用；正式字段、字数限制、截止时区以及 Privy bounty 条件以登录后的主办方页面为准。

## 建议提交定位

- 项目名：**Alice Guard 2.0**
- 主赛道：**Trust, Identity & AI Infrastructure**（提交前在后台核对）
- 可选赞助奖：**Privy**（完整资格要求尚未独立核实）
- 标签：AI agents、financial safety、verifiable decisions、Monad、Privy
- 仓库：`https://github.com/Aisiweiyang/alice-guard/tree/phase-4b-live-privy`（提交前核对最终提交）
- 在线 Demo：Render Blueprint 已准备，待账号持有人创建服务并填入公开 URL；本机 `127.0.0.1` 地址不能填写为公开 Demo
- 视频：待录制

## 一句话介绍

Alice Guard gives AI financial proposals an inspectable decision record and a deterministic server-side boundary before any wallet action.

## 英文短简介

Alice Guard 2.0 is a financial proposal firewall for AI agents on Monad. A Decision Capsule binds the user request, evidence, policy, simulation, and exact transaction plan. The server checks the proposal against its original context, so changing a destination and recomputing hashes still fails. Judges can inspect three fixed scenarios, an Attack Lab with 41 malicious cases and 10 benign controls, and a downloadable evidence pack that can be independently replayed from this repository. Privy wallet policy and read-only binding checks provide a separate wallet control layer. The current public-facing demonstration uses offline fixtures and never signs or broadcasts a transaction.

## 英文详细说明

AI agents can draft financial actions, but a model response should not decide what a wallet is allowed to do. Alice Guard separates a proposal from authorization. It parses a bounded intent, checks provenance and risk, evaluates deterministic policy, builds an exact plan, and writes a hash-linked audit record. A Decision Capsule binds the inputs and result. Before execution, a verifier recomputes the decision from the server's trusted context and rejects changed transaction bytes, stale quotes, policy drift, unavailable state, and replayed nonces.

For judges, the prototype includes an offline web demo, a Proof View that exposes the decision bindings, and an Attack Lab with malicious mutations and legitimate controls. The downloadable Judge Evidence Pack contains fixed scenarios and one run of each case. A separate verification command reconstructs reference results rather than trusting the pack's own pass flag or hash. The repo also includes a 100-repeat deterministic regression, a threat model, and a three-minute walkthrough.

Privy is used beyond login: the repo defines wallet policy constraints, creates and reads back a dedicated test wallet and policy, and can perform optional read-only verification of their binding. The offline attack tests do not claim to be remote Privy enforcement tests. This version labels capsules UNATTESTED and keeps signing, broadcasting, and funding disabled. It does not claim live trading, real-world prompt-injection coverage, or a third-party security audit.

## 评委可复核的操作

在可信仓库版本、Node.js 24.19+ 与已安装依赖的本地环境中：

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run evidence:judge
npm.cmd run evidence:judge:verify -- "<上一步输出的 judge-evidence.json 完整路径>"
npm.cmd run test:attacks
npm.cmd run demo:web
```

`evidence:judge` 是每例单遍的 51 例报告；`test:attacks` 才是每例 100 次的确定性回归。Web 演示不需要 `.env.local`。评委可以按 [三分钟流程](20-judge-demo-runbook.md)依次查看正常提案、超限拒绝、注入拒绝、Decision Capsule、重新封装攻击和良性对照。

## 三分钟视频镜头表

1. 0:00–0:20：标题、问题与 `NO SIGNING / NO BROADCAST / NO FUNDING` 状态。
2. 0:20–0:50：允许的 20 USDC 固定场景，显示计划与执行关闭。
3. 0:50–1:20：Proof View 展开来源和 Capsule 绑定。
4. 1:20–1:55：`Rehashed plan and resealed capsule` 被拒；指出原因码。
5. 1:55–2:15：20 USDC 良性对照被允许通过提案检查。
6. 2:15–2:40：超限和注入场景的早停结果。
7. 2:40–3:00：Judge Evidence Pack、独立复核命令与真实执行边界。

录制前确认实际页面输出。若现场结果与本文件不一致，保留真实结果并修复演示，不能剪辑为虚假的通过画面。

## 需要你本人完成

1. 登录比赛后台，核对提交字段、项目复用规则、Privy bounty 细则与带时区的截止时间；将非敏感截图或文字交给我，我可以据此压缩文案。
2. 登录 Render 并按 [部署交接](24-public-demo-deploy.md)授权仓库、创建免费 Web 服务；公开部署的域名尚不存在。
3. 录制或确认演示视频，上传后提供链接。
4. 最终检查所填赛道与材料，在主办方页面提交。

不要在比赛表单、视频或仓库中展示 `.env.local`、Privy Secret、授权私钥或真实钱包操作凭据。
