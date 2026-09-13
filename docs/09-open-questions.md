# Open Questions and Required Decisions

> Phase 1 不要求项目所有者立即回答。默认技术决策已经记录在 `docs/11-decision-log.md`；只有启用主网或真实资金时才必须再次获得明确确认。

## Decisions requested from the project owner

### 1. Execution progression

Recommendation: **local dry-run → Monad testnet → optional tiny mainnet demo**. Mainnet is never required to prove the safety architecture and should need a separate explicit approval and loss limit.

Decision needed: Is a testnet explorer transaction sufficient for the hackathon submission?

### 2. Wallet control model

Recommendation for hackathon: a newly created, developer-owned Privy agent wallet with strict policy and only test funds. Recommendation for product evolution: user-owned wallet with Alice as a revocable, policy-scoped signer.

Decision needed: Should the demo optimize for fastest autonomous execution, or showcase user ownership/revocation from day one?

### 3. First DEX adapter

Recommendation: Kuru testnet MON/USDC, contingent on live quote, ABI, simulation, liquidity, and Privy policy compatibility tests. Fallback selection occurs only after the spike; no silent switch to a mainnet router.

Decision needed: Approve Kuru as the Phase 3 candidate?

### 4. First LLM provider

Recommendation: use the OpenAI-compatible provider for which you already have reliable credentials, behind the generic interface. Security does not depend on which provider is chosen.

Decision needed: OpenAI, DeepSeek, GLM, or another compatible endpoint for the initial parser?

### 5. Initial policy values

Proposed safe demo defaults:

| Setting | Proposed value |
|---|---:|
| Maximum transaction | 100 USD |
| Rolling 24-hour spend | 200 USD |
| Human approval threshold | 50 USD |
| Maximum slippage | 100 bps |
| Maximum portfolio allocation to MON | 5% |
| Maximum price age | 120 seconds |
| Maximum quote age | 20 seconds |
| Minimum MON gas reserve | Set after measured testnet/mainnet gas behavior |

Decision needed: confirm or change these demonstration values. Testnet values model USD policy even when assets have no economic value.

### 6. Hackathon source of truth

The supplied brief names “Monad Metropolis” and track labels, but this research did not locate an official current event page containing those exact submission rules, dates, sponsor requirements, or judging criteria.

Decision needed: provide the official event/submission URL before Phase 7 so requirements can be verified rather than inferred.

## Engineering questions to answer by spikes

- Does Privy currently accept `eip155:10143` and enforce the planned Ethereum policy conditions for Monad testnet?
- Which Kuru testnet swap method and ABI are current after the 2025-12-16 reset?
- Can every Kuru candidate transaction be decoded into constraints Privy can enforce, including recipient, input amount, minimum output, and spender?
- Is the current testnet MON/USDC market liquid enough for a deterministic small swap demo?
- Which price source covers testnet with a reliable timestamp? If none, keep live execution limits in raw units and label USD risk data as demo/mock evidence.
- What finality/confirmation policy gives a reliable demo without treating speculative state as final?
- Does `better-sqlite3` install cleanly in the target Windows/WSL/CI environment, or should the adapter use a different SQLite driver?

## Go/no-go gates

- Do not start wallet integration until local policy tests and Plan Guard invariants pass.
- Do not fund a wallet until chain, asset, contract, ABI, and wallet policies are verified.
- Do not enable mainnet until a testnet negative-bypass test proves Layer 2 enforcement.
- Do not add Chainlink, CCIP, CRE, another chain, or another protocol solely for sponsor optics.
