# Phase 4A — Privy Layer-2 Policy Research and Implementation Boundary

Research cutoff: **2026-09-14, Asia/Shanghai**.

## Verified sources

- [Privy policy overview](https://docs.privy.io/controls/policies/overview): policy version 1.0 uses rules and conditions; deny wins, no matching rule defaults to deny, and Ethereum transaction/calldata fields can be constrained with an ABI.
- [Privy wallet controls](https://docs.privy.io/security/wallet-infrastructure/policy-and-controls): authorization keys use P-256 request signatures; policy evaluation occurs in Privy's wallet infrastructure, with some simulation-dependent checks enforced at the API layer.
- [Privy stateful policies](https://docs.privy.io/controls/policies/stateful-policies): aggregations update after successful signing, so concurrent requests can all pass before their values are recorded. Alice therefore keeps an application-side atomic reservation ledger.
- [Conditional signer policies](https://docs.privy.io/recipes/wallets/conditional-signer-policies): an additional signer can have an override policy and Privy evaluates the policy associated with the signer used for the request. Alice must never route automated execution through a permissive fallback signer.
- [Privy Node SDK](https://www.npmjs.com/package/@privy-io/node): current package verified as `@privy-io/node` 0.34.0. The older `@privy-io/privy-node` package is deprecated.
- [Safe policy engine](https://github.com/safe-research/policy-engine): stateful grants must remain atomic with execution outcomes; failed or uncertain operations must not silently restore spend authority.
- [CaMeL](https://arxiv.org/abs/2503.18813), [ClawGuard](https://arxiv.org/abs/2604.11790), and [AgentArmor](https://arxiv.org/abs/2508.01249): treat the model as an untrusted proposer and enforce capabilities, provenance and deterministic checks at the action boundary.

## Adopted decisions

1. No wildcard method rule. Alice deliberately rejects Privy's optional forward-compatible allow-all pattern.
2. Only `eth_sendTransaction` rules for the two known Kuru transaction shapes are emitted.
3. Missing methods deny key export, message signing, typed-data signing, raw signing and EIP-7702 authorization.
4. Raw Kuru testnet USDC is capped at 100 tokens at the Privy layer. USD valuation, slippage relative to a quote, freshness and portfolio allocation stay in Alice's deterministic application layer.
5. The current Kuru function has no recipient argument and credits the caller. Recipient semantics therefore remain Plan Guard/application enforced and are not overstated as a standalone Privy condition.
6. A policy hash is computed from canonical JSON. Remote policy drift blocks authorization.
7. The execution envelope binds the intent, evidence, application policy, wallet policy, plan, expiry and one-time nonce.
8. Privy credentials are server-only. The browser receives only status, hashes and coverage labels.

## Runtime modes

- `disabled` (default): fully offline; remote policy status is `NOT_CONFIGURED`.
- `privy-verify`: read-only policy fetch when all three local secret values are present. This mode still cannot sign or broadcast.

No Phase 4A module creates a wallet, adds a signer, mutates a policy, signs a message, signs a transaction or broadcasts a transaction.

## Policy coverage

`PRIVY_ENFORCED` covers chain, target contracts, ABI-decoded functions, token direction, approve spender, raw input cap, zero native value, key export denial and arbitrary-signing denial.

`APP_ONLY` covers exact plan equality, output-recipient semantics, quote-relative slippage, USD valuation, rolling spend, data freshness and human approval. These controls are evaluated before the wallet boundary and bound into the execution envelope.

## Live verification prerequisites

Read-only policy verification requires `ALICE_GUARD_WALLET_MODE=privy-verify`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` and an existing `PRIVY_POLICY_ID`. Credentials must remain in a local secret store or ignored `.env`; they must never be pasted into prompts, logs, API responses or screenshots.
