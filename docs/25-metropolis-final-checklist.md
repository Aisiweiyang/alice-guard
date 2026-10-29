# Metropolis 比赛收尾清单

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

更新：2026-10-07（Asia/Shanghai）。示例项目目录：`alice-guard`。

## 当前交付边界

项目已有确定性金融提案防护、Decision Capsule、审计重放、固定攻击实验和评委证据包。本次修复迁移后的 189 个依赖目录链接、15 个生成的启动器及 pnpm 虚拟依赖目录记录；没有升级依赖或修改锁文件，没有读取 `.env.local`，没有调用真实钱包。

这是可复核的离线提案原型。固定报价、余额、模型输出和模拟结果均为 fixture；Capsule 为 `UNATTESTED`。提案通过不等于钱包执行权限。远端 Privy 状态与真实链上流动性本轮未刷新。

## 本次验收

| 项目 | 2026-10-07 结果 | 本地证据 |
| --- | --- | --- |
| TypeScript | 正常 Windows 环境通过，退出码 0 | `demo-output/validation-20261007-check.log` |
| 浏览器 JavaScript 语法 | `node --check src/ui/app.js` 通过 | 命令退出码 0 |
| 全量离线测试 | 35 文件、307 项全部通过，退出码 0，耗时 272.98 秒 | `demo-output/validation-20261007-tests-native.log` |
| 100 次重复攻击回归 | 51/51 例通过；5,100 次运行、5,049 次比较全部一致；误放／误拒均为 0，退出码 0 | `demo-output/validation-20261007-attacks.log` |
| 评委证据包导出 | 51/51 单遍用例通过；自检 VERIFIED | `demo-output/validation-20261007-export.log` |
| 独立进程复核 | VERIFIED，原因码为空，executionAuthorized=false | `demo-output/validation-20261007-verify.log` |
| 本地 Web | 首页 HTTP 200；健康检查执行能力全关闭；三场景、篡改拒绝和合法对照符合预期 | `demo-output/validation-20261007-http.json`、`demo-output/validation-20261007-http-scenarios.json` |
| 网页证据下载与复核 | 实际下载的 JSON 在独立进程中 VERIFIED | `demo-output/validation-20261007-web-verify.log` |
| 双击启动入口 | 已实际通过 `start-demo.cmd` 启动临时实例 | 本轮临时端口 54551；验收后关闭该实例 |

已导出的证据文件：`demo-output/judge-evidence-4nbmxG/judge-evidence.json`。该包对应的程序源码基线为 `861a641db777918a46a7dc2d149231392e867ff4`；本次文档和启动入口变动未修改决策算法。生成输出与数据库由 Git 忽略，不能把提交代码等同于上传证据文件。

Windows 沙箱内的原生编译器类型解析、本机网络和临时文件共享可能受限。本次通过正常 Windows 环境判断源码检查结果。不能通过关闭校验或把失败报告改成通过来解决环境问题。

初次正常环境回归为 305/307，通过失败分析确认另两项仅超出测试时间预算。已将证据重建测试从默认 5 秒调整为 20 秒、5,100 次完整重放测试从 120 秒调整为 600 秒，并把测试工作进程限制为 2 个。全部用例、输入、分母和安全断言保留；修复后重新完整运行得到以上 307/307。

本次修复将作为比赛分支的交付候选提交；实际打包提交记录在交付包的 `VALIDATION.json`，远端与在线部署需分别核对，不能把提交代码等同于服务已发布。后续发现浏览器在 `4173` 地址保留了 Growth Lab 的页面，因此 Alice Guard 已改用独立默认端口 `4187`，并在浏览器中实际核验标题与正常提案结果。主本地演示为 `http://127.0.0.1:4187`；终端退出后可用启动器重启。上表 HTTP 记录保留当时实际访问的旧端口，不作为后来浏览器显示内容的证明。交付包与更新步骤见 [交付与更新说明](26-delivery-and-updates.md)。

## 启动与复核

双击根目录 `start-demo.cmd`，保持终端打开，并访问显示的本机地址，默认 `http://127.0.0.1:4187`。它不加载 `.env.local`。也可在 PowerShell 执行：

```powershell
cd "alice-guard"
npm.cmd run demo:web
```

可让系统选择空闲端口：先设置 `$env:ALICE_GUARD_DEMO_PORT="0"` 再启动。重新验收用：

```powershell
npm.cmd run check
npm.cmd test -- --maxWorkers=2
npm.cmd run test:attacks
npm.cmd run evidence:judge
npm.cmd run evidence:judge:verify -- "导出命令输出的 JSON 完整路径"
```

`maxWorkers=2` 限制并发资源使用，不减少测试。证据包是单遍 51 例；100 次重复回归是 5,100 次运行和 5,049 次重复比较，两者不得混淆。

## 提交前的四件事

1. **核对规则。** 登录 [Metropolis 官方入口](https://hackathon.monad.xyz/)，确认带时区的最终截止时间、必填字段、仓库公开性、视频要求、项目复用要求与 Privy bounty 细则。2026-10-07 公开页仍显示 1 Sep–13 Oct，但没有公开完整提交表和精确时区。不得用这个日期推断北京时间的最后一分钟。
2. **确定参赛定位。** 建议主方向为 `Trust, Identity & AI Infrastructure`，突出原始上下文绑定、篡改后重算哈希仍会被拒、独立复核材料。这是根据 [Monad Foundation 与 Encode Club 联办活动的赛道介绍](https://luma.com/metropolis-lon-oct-2026)作出的项目匹配建议。Privy 集成资格仍待正式细则核对；本地攻击拒绝不能写成远端 Privy 已真实执行并拒绝交易。
3. **交付评委能打开的演示与视频。** 公开服务配置已有 `render.yaml`；按 [部署交接](24-public-demo-deploy.md)登录托管平台并授权仓库。部署后必须核验实际 URL、三场景、攻击对照和证据下载。本地地址不能替代公开链接。按 [演示流程](20-judge-demo-runbook.md)录制，三分钟是建议，正式时长服从后台要求。
4. **填表并提交。** 使用 [提交文案](23-submission-kit.md)，填入最终仓库版本、实际可打开的 Demo 和视频链接，再由账号持有人提交并保存成功回执。文案不得把 fixture、哈希承诺或只读绑定核验描述为真实成交或生产安全认证。

建议 10 月 8 日完成规则核对与第一次部署，10 月 10 日前完成视频，10 月 11 日完成提交材料与预演，给剩余修复留出时间。这是内部安排，不是主办方公布的截止时间。

## 当前仍未完成

- 公开 Demo URL 与上线验收。
- 实际视频及上传链接。
- 登录后台后的精确规则核对、赞助奖资格判断和正式提交回执。
- 真实执行所需的审批身份、预算／nonce 原子衔接与广播对账；本轮不启用签名或资金操作。如果正式规则明确要求真实交易，再单独确定最小测试网范围。
