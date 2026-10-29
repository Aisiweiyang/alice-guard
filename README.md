# Alice Guard

**作者与维护者：[Aisiweiyang](https://github.com/Aisiweiyang)** · [MIT 许可证](LICENSE) · [English](README.en.md)

面向 AI Agent 金融提案的确定性检查与审计工具。将请求、证据、风险规则、策略和交易计划绑定在同一份决策记录中，再从服务端保留的上下文复核结果，展示允许、拒绝和需要确认的原因。

**当前为 v0.1.0 初始开源版，后续不定期更新和维护，暂无固定更新周期。** 默认演示完全离线，不需要 API Key、Privy 账号或钱包。

![Alice Guard 离线提案检查界面](docs/images/demo.png)

## 可以做什么

- **提案检查**：限定意图格式，核对原始请求，按确定性风险与权限规则裁决。
- **计划复核**：检查目标合约、金额、滑点、交易字节、时效、模拟结果与配置绑定。
- **决策记录**：生成 Decision Capsule 和 SQLite 哈希链审计，支持本地重放。
- **交互演示**：查看三个固定场景、证据来源、51 个攻击变体与正常对照。
- **证据导出**：导出合成用例并独立重建参考结果，不信任导出文件自己的通过标记。
- **可选适配器**：保留模型意图解析、Monad/Kuru 只读查询、Privy 策略检查及受控配置工具；离线演示不会调用它们。

当前只覆盖 **Monad 测试网 USDC → MON** 的有限计划模型，不是通用交易执行器。签名、广播和资金操作在演示与执行验证器中均关闭；检查通过也不会授权执行。

## 快速开始

需要 **Node.js 24.19 或更新版本**，推荐 Node.js 24 LTS：

```bash
git clone https://github.com/Aisiweiyang/alice-guard.git
cd alice-guard
npx --yes pnpm@11.19.0 install --frozen-lockfile
npm run demo:web
```

打开 `http://127.0.0.1:4187`。Windows 也可在安装依赖后双击 `start-demo.cmd`。端口被占用时更换 `ALICE_GUARD_DEMO_PORT`，以终端实际输出为准。

**无需创建 `.env.local`。** 三个场景分别是 20 USDC 提案、超限拒绝和提示注入拒绝，均使用固定时间、合成证据与模拟结果。

## 检查与重放

```bash
npm run demo
npm run check
npm test
npm run test:attacks
npm run evidence:judge
npm run evidence:judge:verify -- "<上一步输出的 judge-evidence.json 路径>"
npm run check:public
```

`test:attacks` 对 51 个固定用例各运行 100 次；证据导出只运行单遍。命令中的 `judge` 是保留的历史接口名。运行产物写入 `demo-output/`，不会覆盖旧会话，也不会提交到 Git。

`check:public` 需要 Git 克隆的仓库根目录；下载 ZIP 后可安装和运行演示，但 ZIP 不包含 Git 历史。

演示服务每次启动最多保存 1,000 条审计记录，最多并行处理 4 个演示请求和 2 个攻击用例；满额会返回明确提示，重启后生成新会话，原记录保留。审计接口只展示最近 50 条摘要，但仍验证完整会话链。公网使用需另配访问控制与请求速率限制。

## 项目结构

| 目录 | 内容 |
|---|---|
| `src/domain` | 严格数据结构、金额表示、哈希、Capsule 与执行信封 |
| `src/engines` / `src/application` | 风险与策略规则、计划复核、审计及证据重放 |
| `src/adapters` | SQLite、模型、只读链查询和 Privy 接口 |
| `src/server` / `src/ui` | 离线 HTTP 服务和浏览器界面 |
| `tests` | 单元、集成、拒绝路径、变体与对照测试 |
| `scripts` / `docs` | 本地命令、发布检查和技术文档 |

## 使用边界

- 默认演示是 `OFFLINE_FIXTURE`，Capsule 为 `UNATTESTED`。哈希只能核对内容一致性，不能证明来源真实、经济安全或钱包授权。
- 固定用例的通过率不是现实提示注入防御率，也不是独立安全审计、真实 Privy 拒绝或真实链上执行证据。
- 可选 Privy provisioning 命令会创建远端资源，需要单独配置和精确确认哈希；不属于快速开始，不应在 CI 或公开演示中启用。
- 历史测试网地址、ABI、第三方接口和方法假设可能已变化，接入前必须重新核验。
- 本版没有实现 Alice 量化系统接入、实盘交易、账户托管或投资建议。

文档：[使用说明](docs/USAGE.md) · [架构](docs/ARCHITECTURE.md) · [本轮验证](docs/VALIDATION.md) · [文档索引](docs/INDEX.md) · [贡献](CONTRIBUTING.md) · [安全](SECURITY.md)

源码与原创文档按 MIT 许可证开放；第三方组件保留各自版权与许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。
