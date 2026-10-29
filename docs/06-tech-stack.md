# Technology and Repository Proposal

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

## Decision

Use a single TypeScript repository and modular monolith. A package-based monorepo adds release/configuration overhead without improving the one-developer MVP. Security boundaries are expressed as module interfaces and dependency direction, not as network services.

## Stack

| Area | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ LTS-compatible | Matches the current Privy Node SDK prerequisite and Windows/WSL workflow. |
| Language | TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | Makes boundary and absence handling explicit. |
| Schema | Zod | One runtime validator and inferred TypeScript types. All external inputs validate at entry. |
| EVM | `viem >= 2.40.0` | Monad officially lists this version floor; strong typed ABI utilities and simulation. |
| Wallet | `@privy-io/node` behind `WalletProvider` | Current server SDK; policies, owners/signers, authorization keys, and EVM transaction methods. |
| DEX | Kuru adapter first | Official testnet MON/USDC market exists; mainnet Kuru Flow offers a Monad-native aggregator. Adapter output remains untrusted until decoded. |
| Oracle | Provider interface; Chainlink feed adapter only when useful | Mainnet supports Chainlink feeds/streams. MVP can demonstrate freshness deterministically without forcing an onchain oracle into the transaction path. |
| Database | SQLite with explicit SQL and migrations | Durable audit/idempotency/reservation state without operating a service. Evaluate `better-sqlite3` Windows install during Phase 1. |
| Tests | Vitest | Fast TypeScript unit/integration tests with table-driven boundary cases. |
| CLI | `tsx`-driven command entry | Fastest path to exercise the core before UI. |
| UI | Next.js in Phase 6 | One process can host the minimal dashboard and server routes. Do not start here. |
| Package manager | pnpm with committed lockfile | Available in the current Codex runtime, deterministic, and lightweight for a single package. |

## Money and time representation

- Token amounts: canonical unsigned integer strings in base units.
- Human decimal amounts: canonical decimal strings, parsed with explicit token decimals.
- USD values: fixed-scale decimal strings or integer micro-USD; never JavaScript floating point.
- Basis points and risk score: bounded integers.
- Timestamps: UTC ISO 8601 strings at API boundaries; integer seconds/milliseconds only with named units internally.
- Addresses: validated 20-byte EVM hex and normalized/checksummed by viem.

## LLM provider interface

```ts
interface LLMProvider {
  parseIntent(input: {
    requestId: string;
    userText: string;
    schemaVersion: string;
  }): Promise<unknown>;
}
```

The provider returns `unknown`; only Zod can promote it to `AgentIntent`. The prompt exposes allowed symbols, action vocabulary, and schema—not addresses, wallet secrets, signer methods, protocol ABIs, or tools. MVP implements one OpenAI-compatible adapter using structured JSON where supported, followed by mandatory local validation.

## Dependency rule

```text
domain <- engines <- application <- adapters / CLI / web
```

- `domain` imports only Zod and stable utility code.
- `engines` are pure and cannot import network, database, LLM, wallet, or clock clients.
- `application` orchestrates ports and owns the state machine.
- `adapters` implement external I/O and may depend on viem/Privy/Kuru/SQLite.
- Only the wallet adapter exposes an execution method; there is no general signer object.

## Proposed repository structure

```text
Alice Guard/
├─ README.md
├─ package.json
├─ pnpm-lock.yaml
├─ tsconfig.json
├─ .gitignore
├─ docs/
│  └─ 01...09
├─ src/
│  ├─ domain/
│  │  ├─ schemas.ts
│  │  ├─ reason-codes.ts
│  │  └─ canonicalize.ts
│  ├─ engines/
│  │  ├─ risk-engine.ts
│  │  └─ policy-engine.ts
│  ├─ application/
│  │  ├─ evaluate-request.ts
│  │  ├─ execute-plan.ts
│  │  └─ ports.ts
│  ├─ adapters/
│  │  ├─ llm/
│  │  ├─ monad/
│  │  ├─ price/
│  │  ├─ kuru/
│  │  ├─ privy/
│  │  └─ sqlite/
│  ├─ config/
│  │  ├─ networks.ts
│  │  ├─ assets.ts
│  │  ├─ contracts.ts
│  │  └─ policies.ts
│  ├─ cli/
│  └─ app/                    # added in Phase 6
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  └─ security/
└─ data/                      # ignored local SQLite files
```

## Configuration strategy

Network, token, contract, ABI, oracle, and policy configuration is versioned and validated at startup. Address entries include source URL, source commit/version where possible, environment, and `verifiedAt`. Startup refuses execution if chain ID mismatches or required configuration is missing/stale. Mainnet execution uses a separate configuration file and explicit feature flag; it cannot be enabled by a user prompt.

## Components intentionally deferred

- Solidity contracts, Hardhat/Foundry project, subgraphs, Docker/Kubernetes, queues, Redis, Postgres, microservices, event buses, and multi-chain SDK layers.
- Chainlink Data Streams for a low-frequency spot swap, CCIP for a single-chain flow, and CRE for local request/response orchestration.
