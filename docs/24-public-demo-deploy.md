# 公开演示部署交接（Render Blueprint）

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

更新日期：2026-10-07。仓库根目录的 `render.yaml` 已准备离线 Web 服务。**本机尚无已核验的公开 URL。** 该部署只用于评委体验固定场景、Proof View、Attack Lab 和 Judge Evidence Pack。后续发布、指定提交更新与回退见 [交付与更新说明](26-delivery-and-updates.md)。

## 已在代码中固定的边界

- 启动命令为 `npm run demo:web:public`，使用 `scripts/serve-public-demo.ts`；该入口不加载 `.env.local`，不创建 Privy 客户端，不签名、不广播。
- 如果运行环境带有 `PRIVY_` 变量或非 `disabled` 钱包模式，启动直接失败。不要在 Render 配置 Privy Secret、授权私钥或钱包凭据。
- 只在这个公开入口监听 Render 要求的 `0.0.0.0:$PORT`。平常 `demo:web` 仍只监听本机。
- HTTP 请求只接受预定义场景和 Attack Lab case ID；证据包由内置固定数据生成，不含演示会话审计库。
- `render.yaml` 指向 `phase-4b-live-privy` 分支、免费实例、新加坡区域，健康检查为 `/api/health`，自动部署关闭，需手动审核后发布新版。

## 你在 Render 后台完成的动作

1. 登录 Render，连接有权访问 `Aisiweiyang/alice-guard` 的 GitHub 账号。
2. 选择 **New → Blueprint**，选该仓库的 `phase-4b-live-privy` 分支和仓库根目录 `render.yaml`。
3. 检查服务计划为 **Free**，环境变量只有 `NODE_VERSION=24.19.0` 与 `ALICE_GUARD_WALLET_MODE=disabled`，然后确认创建。
4. 部署成功后复制 Render 给出的 `https://…onrender.com` 地址交给我；我会核对健康检查、三个场景、攻击与证据包页面，并更新最终提交文案。

如不希望将 GitHub 仓库授权给 Render，可选自己信任的其他 Node 托管平台，但需要相同的启动命令和 `PORT`，并确保没有 Privy 秘密进入公开实例。

## 发布后验收

- `GET /api/health` 返回 `walletEnabled=false`、`signingEnabled=false`、`broadcastEnabled=false`。
- 页面状态栏显示 `NO SIGNING / NO BROADCAST / NO FUNDING`。
- 正常 20 USDC 场景产生准备好的提案；超限与注入场景被拒；Attack Lab 良性对照能通过提案检查。
- 第 06 区域能生成并下载固定 JSON；本地从同一提交运行 `evidence:judge:verify` 可以重放。
- 页面或 API 不出现 `.env.local`、Privy Secret、授权私钥，也不把离线结果写成真实链上成交。

Render 的免费 Web 服务空闲约 15 分钟后会休眠，首次唤醒可能需要约一分钟；本地 SQLite 文件在重启或重新部署后会丢失。因此这个实例只承载可重放的演示，不应承担永久审计留存或真实钱包服务。参见 [Render Web Services](https://render.com/docs/web-services) 与 [Free tier](https://render.com/docs/free)。
