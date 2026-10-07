# 交付、更新与回退

更新：2026-10-07（Asia/Shanghai）。交付对象为 Alice Guard 2.0 离线比赛原型，当前比赛分支是 `phase-4b-live-privy`。

## 本次交付

- 修复项目迁移后的本地依赖链接；这属于安装环境，不把 `node_modules` 放进源码包。
- 本地默认端口改为 `4187`，避免浏览器与 Growth Lab 的 `4173` 页面混淆。
- 新增 Windows 双击入口 `start-demo.cmd`。
- 修正 pnpm 中 esbuild 的构建许可占位值，仅允许锁定的 `esbuild@0.28.2` 安装脚本，保证新目录安装正常退出。配置依据为 [pnpm 构建设置文档](https://pnpm.io/settings/build#allowbuilds)。
- 保留全部测试断言，限制测试并发，并为完整证据重建和 5,100 次重放留出适当时间。
- 新增交付构建脚本，使用稳定的 Git 提交重新运行检查、测试、攻击回归、证据导出和独立复核。
- 原有 Render 公开入口与钱包执行边界保持原设计。没有新增签名、广播或真实交易。

## 生成交付包

在正常 Windows PowerShell 中，从通过 Git 克隆、已提交且工作区干净的版本运行（ZIP 副本不含 `.git`，不能直接重新构建交付或执行 `git pull`）：

```powershell
cd "C:\Users\Asus\Desktop\Alice\Alice Guard"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-delivery.ps1
```

完整重复验证需要数分钟，等待每步显示通过。任一步失败就停止生成交付包。日志保存在被 Git 忽略的 `demo-output/delivery-*`，输出 ZIP 位于被忽略的 `delivery/`。构建不加载 `.env.local`，不调用真实钱包，也不自动部署或上传文件。

包包含 `source.zip`、`judge-evidence.json`、`attack-regression.json`、`VALIDATION.json`、`DELIVERY.txt` 和 `SHA256SUMS.txt`。源码归档仅来自指定 Git 提交；脚本拒绝打包被跟踪的秘密环境文件、运行数据库和依赖目录。校验文件提供完整性核对，不能替代来源签名或生产安全审计。

## 收到包后启动

把 `source.zip` 解压到一个新目录，进入其中的仓库根目录，再执行：

```powershell
npx.cmd -y pnpm@11.19.0 install --frozen-lockfile
npm.cmd run evidence:judge:verify -- "交付包中 judge-evidence.json 的完整路径"
npm.cmd run demo:web
```

打开 `http://127.0.0.1:4187`，实际页面标题应为 `Alice Guard 2.0 — Financial Firewall for AI Agents`。不要复制另一目录的 `node_modules`；其中的 Windows junction 可能仍指向旧路径。证据复核需使用包内匹配的源码提交。

## 更新已有本地副本

ZIP 副本的更新方式是把新包解压到新目录并重新安装依赖；保留旧目录即可回看旧版。下列 Git 命令仅用于通过 Git 克隆的仓库副本。

先关闭这个副本自己启动的演示终端，查看 `git status --short` 并保存自己的修改。工作区干净时：

```powershell
git switch phase-4b-live-privy
git pull --ff-only origin phase-4b-live-privy
npx.cmd -y pnpm@11.19.0 install --frozen-lockfile
npm.cmd run check
npm.cmd test
npm.cmd run evidence:judge
npm.cmd run evidence:judge:verify -- "本次新导出的 JSON 完整路径"
npm.cmd run demo:web
```

`pull --ff-only` 拒绝自动混合分叉历史。如果有本地修改或分支分叉，先检查差异并保留修改，不能用硬重置覆盖。完整交付前再执行构建脚本，它会包含 100 次攻击回归。

## 发布当前版本到 Render

GitHub 推送与在线服务更新是两件事。`render.yaml` 设置 `autoDeployTrigger: off`，因此推送不等于服务已更新。

1. 首次部署按 [部署交接](24-public-demo-deploy.md)登录并连接仓库，创建服务。公开 URL 尚未验证，不把本机地址填写为在线 Demo。
2. 后续更新：先把通过验收的提交推送到比赛分支。Render 服务的 Deploys 页面选择 **Manual Deploy → Deploy a specific commit**，填写本次交付包 `VALIDATION.json` 中的 `sourceCommit`。需要跟随最新分支时可使用 **Deploy latest commit**。
3. 确认部署日志中的提交与交付包一致，健康检查为 `/api/health`。页面标题必须是 Alice Guard，执行能力全关闭；再检查三场景、篡改拒绝、合法对照与证据下载，并用对应提交独立复核。
4. 只有实际 URL 和操作验收通过后，才在提交材料中写“在线演示已发布”。不要在公开服务配置 Privy 秘密或钱包凭据。

以上手动部署方式已对照 [Render 部署文档](https://render.com/docs/deploys)核查。若代码已更新但浏览器仍显示旧页面，先核对地址、部署提交和页面标题，再刷新页面；不要把旧标签标题当成新部署验收。

## 更新失败时回退

Render 的 Deploys 页面可选择仍有构建产物的近期成功部署，点击 **Rollback → Rollback to this deploy**。完成后重复健康检查和演示验收。根据 [Render 回退文档](https://render.com/docs/rollbacks)，磁盘数据不随代码部署回退，环境组的共享值也不被恢复；离线演示不能依赖该动作恢复审计历史。

本机需要回看旧版本时，先保存自己的修改；可从已知提交创建另一个干净目录并安装依赖。不要通过复制依赖目录或删除数据库完成回退。

## 后续功能更新的优先级

先完成公开 Demo、视频、正式规则核对与提交回执，形成完整的比赛交付。下一版可优先增加版本／提交展示、公开 URL 自动验收、真正的在线 LLM 结构化提案评测。每项应保留真实来源与离线 fixture 的区分。

真实 Monad／Privy 执行是单独的范围：必须先补齐新鲜链上证据、审批身份与一次性消费、预算／nonce 原子状态、失败与未知广播对账，再明确测试网签名和资产使用边界。本次交付包不把这一缺口写成已完成。
