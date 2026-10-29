# 第三方组件与来源

Alice Guard 原创源码和文档使用 MIT 许可证。依赖由包管理器安装，不把 `node_modules` 加入仓库；组件仍适用各自许可证。完整版本和完整性信息见 `pnpm-lock.yaml`。

| 组件 | 用途 | 上游 |
|---|---|---|
| `@privy-io/node` | 可选 Privy API 适配器 | https://github.com/privy-io/node-sdk |
| `viem` | EVM 编码、地址和只读链客户端 | https://github.com/wevm/viem |
| `zod` | 运行时数据验证 | https://github.com/colinhacks/zod |
| `typescript` / `@types/node` | 类型检查 | https://github.com/microsoft/TypeScript / https://github.com/DefinitelyTyped/DefinitelyTyped |
| `tsx` | TypeScript 本地运行 | https://github.com/privatenumber/tsx |
| `vitest` / `vite` | 离线测试与转换 | https://github.com/vitest-dev/vitest / https://github.com/vitejs/vite |

本轮安装清单中，Privy Node SDK 和 TypeScript 为 Apache-2.0；viem、Zod、tsx、Vitest 为 MIT。具体以安装版本附带的许可证为准。

安装后可运行 `npx --yes pnpm@11.19.0 licenses list` 查看许可证；分发包含依赖的镜像或二进制时，应保留对应许可文件。

Monad、Kuru、Privy 和 OpenAI 的名称、接口及文档属于各自提供方；链接和适配器不表示官方合作、背书或认证。历史测试网信息可能已变更。

演示文本、报价、行情、模拟结果和攻击/对照用例是程序自带的合成开发样例。历史技术文档中的公开资源标识与本版离线用例分开看待，不能据此推断当前钱包状态。
