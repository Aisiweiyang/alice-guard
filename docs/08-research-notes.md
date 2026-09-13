# Official Research Notes

Research cutoff: **2026-09-12, Asia/Shanghai**. Dynamic chain and SDK facts must be refreshed before implementation and again before the demo.

## 1. Monad

### Verified network state

- Public mainnet launched on **2025-11-24**.
- Mainnet: name `Monad Mainnet`, chain ID `143`, currency `MON`, public RPC `https://rpc.monad.xyz`, websocket `wss://rpc.monad.xyz`, explorers MonadVision and Monadscan.
- Testnet: name `Monad Testnet`, chain ID `10143`, currency `MON`, public RPC `https://testnet-rpc.monad.xyz`, websocket `wss://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, explorers `testnet.monadvision.com` and `testnet.monadscan.com`.
- The current testnet was reset from genesis on **2025-12-16**. Pre-reset addresses and tutorials are unsafe.
- Monad is EVM bytecode and Ethereum JSON-RPC compatible, but application code must still account for Monad-specific gas/timing behavior.
- Current deployment guidance lists `viem >= 2.40.0` and Foundry `v1.8+` with Monad execution-network support.
- Important gas detail: Monad charges based on the transaction gas limit (`value + gas_price * gas_limit`), making conservative but excessive gas limits economically relevant.

Official sources:

- [Current Facts for AI Agents](https://docs.monad.xyz/ai/current-facts)
- [Mainnet network information](https://docs.monad.xyz/developer-essentials/network-information)
- [Testnet network information and faucet](https://docs.monad.xyz/developer-essentials/testnet)
- [Deployment summary and supported tooling](https://docs.monad.xyz/developer-essentials/summary)
- [JSON-RPC API reference](https://docs.monad.xyz/reference/json-rpc/api)

### Implication for Alice Guard

Use local deterministic tests first, Monad testnet for execution, and mainnet only as a separately approved tiny-value milestone. Never copy addresses from older tutorials. Pin all environment-specific addresses with source and verification time.

## 2. Privy wallet infrastructure

### Verified capabilities

- Current server SDK is `@privy-io/node`; older `@privy-io/server-auth` code should be treated as migration material.
- An Ethereum wallet can be created through `privy.wallets().create({ chain_type: 'ethereum' })`.
- EVM sends use `privy.wallets().ethereum().sendTransaction(...)` with a CAIP-2 identifier and transaction chain ID. Monad values would be `eip155:10143` or `eip155:143`, but actual support/policy behavior must be proven in an integration spike rather than assumed.
- Two relevant control models exist: developer-owned agent wallet, or user-owned wallet with an agent as a scoped signer. The latter better matches long-term user sovereignty; the former is simpler for a disposable hackathon dev wallet.
- Policies support chain restrictions, transfer maximums, recipient/contract lists, decoded calldata/function/parameter constraints, time bounds, and restrictions on signing/export methods.
- Policy evaluation semantics are default deny; any matching `DENY` overrides `ALLOW`.
- Owners/signers and key quorums can require multiple authorizers.
- Stateful aggregations support rolling spending caps, but an app has an aggregation limit and concurrent requests may pass before a successful signature updates the aggregate. Privy explicitly recommends combining this with per-transaction limits/rate limiting.
- Policy documentation distinguishes enclave-enforced rules from separate simulation/compliance checks; exact enforcement behavior for the methods we use must be tested.

Official sources:

- [Agentic wallets](https://docs.privy.io/recipes/agent-integrations/agentic-wallets)
- [Wallet security, policies, and controls](https://docs.privy.io/security/wallet-infrastructure/policy-and-controls)
- [Policies overview and default-deny semantics](https://docs.privy.io/controls/policies/overview)
- [Ethereum policy examples](https://docs.privy.io/controls/policies/example-policies/ethereum)
- [Stateful policies and concurrency caveat](https://docs.privy.io/controls/policies/stateful-policies)
- [Node.js SDK quickstart](https://docs.privy.io/basics/nodeJS/quickstart)
- [Server SDK migration](https://docs.privy.io/basics/nodeJS/advanced/migrating-from-server-auth)

### Implication for Alice Guard

Privy is a credible Layer 2 candidate, but it is not a replacement for semantic USD/risk policy. Phase 4 must prove Monad transaction and policy enforcement with direct negative tests before the architecture claims are used in a demo.

## 3. Chainlink on Monad

### Verified capabilities

- Monad's official oracle directory marks Chainlink supported and lists Price Feeds (push) and Data Streams (pull).
- The official Monad protocol registry contains mainnet Chainlink Data Streams Router/VerifierProxy and Price Feed proxies, including `MON/USD` and `USDC/USD`. Addresses are deliberately not copied into executable config during Phase 0; implementation should consume and independently verify the current official registry.
- Chainlink's CCIP directory lists Monad mainnet, currently with multiple lanes/tokens. CCIP is therefore available, but is irrelevant to a single-chain swap MVP.
- CRE provides decentralized workflow orchestration, HTTP/EVM capabilities, simulation, and consensus. Its deployment requires access approval, and no need in the current request path justifies this added runtime.

Suitability decision:

| Product | Fit for Alice Guard MVP | Decision |
|---|---|---|
| Price Feeds | Useful for mainnet USD value and freshness checks | SHOULD HAVE adapter; fail closed when unavailable/stale. |
| Data Streams | Designed for low-latency pull market data | Defer; excessive for occasional spot swaps unless sponsor/demo requirements justify it. |
| CCIP | Cross-chain messaging/token transfer | Post-hackathon; violates Monad-first/single-chain boundary. |
| CRE | Decentralized orchestration | Post-hackathon research; local deterministic pipeline is simpler and easier to audit. |

Official sources:

- [Monad oracle directory](https://docs.monad.xyz/tooling-and-infra/oracles)
- [Monad official Chainlink deployment registry](https://github.com/monad-crypto/protocols/blob/main/mainnet/chainlink.jsonc)
- [Chainlink Price Feeds](https://docs.chain.link/data-feeds/price-feeds)
- [Chainlink Data Streams](https://docs.chain.link/data-streams)
- [Monad CCIP directory](https://docs.chain.link/ccip/directory/mainnet/chain/monad-mainnet)
- [Chainlink CRE overview](https://docs.chain.link/cre)

## 4. Monad DeFi and swap route

### Verified ecosystem facts

- Monad maintains an official/community-coordinated protocol registry for mainnet and testnet contract metadata. Presence is not an endorsement or liquidity/security guarantee.
- Mainnet registry entries include Kuru, Uniswap, PancakeSwap, LFJ, WooFi, KyberSwap, Matcha, and other DEX/aggregator deployments.
- The current post-reset testnet registry has a Kuru `MON/USDC` market, router, margin account, and test USDC entry; Uniswap and PancakeSwap are not listed as testnet DEX deployments there.
- Kuru's official docs describe Kuru Flow as a Monad liquidity aggregator with a quote/build API, publish current mainnet/testnet contract addresses, and provide a TypeScript SDK. The Flow quote API requires a JWT and returns route/build data that must be considered untrusted.
- Neither a directory entry nor a published address proves current liquidity. Liquidity and executable quote quality must be measured live during Phase 3 and before every execution.

### Recommendation

Use Kuru as the first adapter because it offers a current, official testnet MON/USDC path and a mainnet-native aggregation route. Do not let its API/SDK bypass Plan Guard. If Phase 3 cannot obtain a fresh, simulatable testnet route, keep the deterministic demo local and select a mainnet protocol only after a documented adapter spike and explicit approval.

Official sources:

- [Monad protocol registry](https://github.com/monad-crypto/protocols)
- [Mainnet protocol registry CSV](https://raw.githubusercontent.com/monad-crypto/protocols/refs/heads/main/protocols-mainnet.csv)
- [Testnet protocol registry CSV](https://raw.githubusercontent.com/monad-crypto/protocols/refs/heads/main/protocols-testnet.csv)
- [Monad token list warning: inclusion is not endorsement](https://github.com/monad-crypto/token-list)
- [Kuru contract addresses](https://docs.kuru.io/contracts/Contract-addresses)
- [Kuru Flow API overview](https://docs.kuru.io/kuru-flow/flow-overview)
- [Kuru quote API](https://docs.kuru.io/api-reference/calculate-best-path-quote)
- [Kuru TypeScript SDK quickstart](https://docs.kuru.io/sdk/quickstart-sdk)

## Research conclusions

1. The chain is production-live, but testnet remains the correct first execution environment.
2. Address drift after testnet reset is a first-class security risk.
3. Privy maps well to the second safety layer, with important enforcement and concurrency limits that must be stated honestly.
4. Kuru is the strongest first protocol candidate for the current testnet; live liquidity is still an open empirical question.
5. Chainlink Price Feeds may add real freshness/value validation on mainnet; Streams, CCIP, and CRE are not justified for the narrow MVP.

