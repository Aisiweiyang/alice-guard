# Decision Log

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

The project owner delegated technical defaults because the earlier choices were too specialized to evaluate comfortably. These decisions are reversible until they cross the stated safety gate. No immediate user decision is required for Phase 1.

## D-001 — Execution environment

**Decision:** local deterministic tests first, then Monad testnet. A testnet explorer transaction is sufficient for the first complete demo milestone.

**Mainnet gate:** separate explicit user approval, verified current contracts, successful wallet-policy bypass tests, and a disposable loss limit.

## D-002 — Wallet model

**Decision:** use a newly created, developer-owned Privy test wallet for the hackathon path. It must contain only test funds and have no relationship to a personal or cold wallet.

**Long-term direction:** user-owned wallet with Alice as a revocable scoped signer.

## D-003 — First protocol candidate

**Decision:** Kuru testnet USDC-to-MON remains the Phase 3 candidate.

**Go/no-go gate:** current address/ABI verification, live liquidity, deterministic quote, successful simulation, and calldata fields that can be constrained by Plan Guard and Privy. Failure means dry-run fallback, not silent mainnet switching.

## D-004 — LLM provider

**Decision:** keep the model interface provider-agnostic. In Phase 2, implement one OpenAI-compatible adapter using whichever existing credential is available; the provider cannot change security decisions.

## D-005 — Demo policy defaults

**Decision:** adopt the proposed development defaults as versioned configuration:

- Maximum transaction: 100 USD.
- Rolling 24-hour spend: 200 USD.
- Human approval at or above 50 USD.
- Maximum slippage: 100 bps.
- Maximum post-trade MON allocation: 5%.
- Maximum price age: 120 seconds.
- Maximum quote age: 20 seconds.
- Native reserve: unresolved until Monad gas behavior is measured; execution remains disabled meanwhile.

These are demonstration values, not personalized financial advice or production risk limits.

## D-006 — Hackathon rules

**Decision:** lack of a verified Monad Metropolis submission URL does not block local engineering, but it blocks final sponsor claims and Phase 8 submission. Recheck in Phase 7 or when the owner supplies the official page.
