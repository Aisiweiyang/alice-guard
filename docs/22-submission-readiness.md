# 比赛提交准备与证据包

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

核查日期：2026-09-27。当前状态：**可复核离线演示已形成并同步至 GitHub；完整参赛资格、公开部署和真实执行仍未完成。** 本页不是替主办方作资格判断。

## 官方规则核查

- [官方入口](https://hackathon.monad.xyz/)当前显示 Metropolis、1 Sep–13 Oct、$250,000+，但公开页只提供登录入口，没有显示完整提交表与评分细则。
- [Monad Foundation 与 Encode Club 联办的 London Builder Day 页面](https://luma.com/metropolis-lon-oct-2026)列出四个赛道及 Privy 赞助，支持当前选择 `Trust, Identity & AI Infrastructure` 作为方向；这只是赛道匹配建议，不是入选或获奖保证。
- 用户先前截图写有 Privy 集成应超出登录，login-only 不符合要求。此次未从公开正式 bounty 详情页独立确认其完整最新版条件，仍需登录后查看。
- 官方入口显示 10 月 13 日，用户截图顶部显示 Oct 14 · 11:59 GMT+8。未取得精确官方时区说明，不能自行确定截止时刻。不要引用搜索缓存中的另一场 2025 evm/accathon 规则。

| 检查项 | 当前证据 | 状态 / 下一步 |
| --- | --- | --- |
| 可信 AI 基础设施主赛道 | 官方联办活动存在该赛道；项目定位匹配 | 方向匹配，详细评审标准未核实 |
| Privy beyond-login 技术内容 | wallet/policy manifest、已有只读远端绑定入口；非登录演示 | 有技术基础，不等于满足完整 bounty 细则 |
| Privy 真实策略拒绝 | 本轮未请求远端签名/交易，也未声称发生真实拒绝 | 未完成；需要单独设计并授权测试 |
| 离线演示可运行 | 三场景、Proof View、51 个 Attack Lab 用例 | 本地可验证 |
| 可分发与复核证据 | 新增 fixture JSON 导出、单独 Node 进程重建参考结果 | 本轮实现；不包含密钥或当前用户审计库 |
| 代码仓库提交状态 | Alice Guard 2.0 交付候选已提交并推送到 `phase-4b-live-privy` 分支；公开部署入口见 `render.yaml` | 后续修改需按实际新提交核对，提交页要链接最终版本 |
| 公开 Web Demo | Render Blueprint 与无凭据公开入口已准备 | 尚未创建 Render 服务；需要账号持有人登录并授权仓库，部署后再验收 URL |
| 演示视频 | 三分钟讲稿和操作流程 | 尚未录制；三分钟是准备方案，不是已核实的官方时长要求 |
| 必填提交字段 / 仓库公开性 / 部署要求 / 团队人数 / 既有项目复用 | 公开入口未提供完整规则 | UNVERIFIED；需用户提供已登录页面或正式规则链接 |
| 精确截止时间 | 日期与截图存在待解释差异 | UNVERIFIED；需确认时区 |

[Privy 官方策略文档](https://docs.privy.io/security/wallet-infrastructure/policy-and-controls)说明钱包操作可受授权密钥和策略限制，包含转账限制、目标合约及 calldata 等控制。这能支持集成方案的技术依据，但不能代替赛事 sponsor 的资格认定。

## 证据包内容与命令

网页第 06 区域 `Judge Evidence Pack` 可生成并下载固定 fixture JSON；它与刚点击的网页会话审计分开。下载不上传任何内容。

```powershell
cd "alice-guard"
npm.cmd run evidence:judge
npm.cmd run evidence:judge:verify -- "实际输出的 judge-evidence.json 路径"
```

导出在 `demo-output/judge-evidence-*/judge-evidence.json` 新建文件，不覆盖旧报告。验证接受一个本地 JSON 文件（最大 2 MiB），不把其中的路径、脚本、passed 标志或自附哈希当成权限。它从当前可信项目代码重新运行固定场景和攻击案例，比较完整审计、目录、结果、指标与哈希，同时重放正常和政策拒绝记录。修改数据并重新计算哈希，仍应因参考不一致而失败。

包不包含打包时的真实行情、真实时间有效性证明或签名。`fixtureTime` 是固定演示时间；`packHash` 是内容标识。`VERIFIED` 只表示与同版本可信本地代码的固定数据一致，不是第三方认证、生产安全审计或主办方验收。

单遍报告为 51 个用例各运行一次。每例 100 次重复基准仍应单独执行 `npm.cmd run test:attacks`，不能混用两种测试数量。

## 你本人需要做的事

现在不需要提供密钥、测试币或继续创建钱包。近期只需打开已登录的比赛页面，提供三类非敏感信息：

1. 提交表要求哪些材料，以及是否允许基于已有项目继续开发。
2. Privy bounty 的完整要求与验收字段。
3. 带时区的最终截止时间。

后续我可以继续准备材料、实现与测试；账号确认、正式提交、涉及钱包签名或资金的动作会另行说明范围并请求授权。
