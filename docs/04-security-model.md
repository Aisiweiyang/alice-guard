# Security Model

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

## Security invariant

No transaction may reach a signer unless a validated high-level intent, fresh evidence, deterministic risk assessment, deterministic policy decision, validated transaction plan, and any required human approval all refer to the same canonical request and plan hashes.

## Two-layer permission model

### Layer 1 — Alice semantic, risk, and policy controls

This layer understands USD value, portfolio allocation, data freshness, slippage, balance reserve, cumulative spending, token/contract reputation, and human-approval thresholds. It is deterministic but application-level and therefore not the final blast-radius boundary.

Required MVP rules:

1. Maximum USD value per transaction.
2. Rolling 24-hour maximum spend with database reservation.
3. Input/output token allowlist.
4. Contract and function allowlist.
5. Output recipient fixed to the agent wallet.
6. Maximum slippage in basis points.
7. Minimum native MON reserve after gas estimate.
8. Maximum post-trade portfolio allocation.
9. Maximum price and quote age.
10. Human approval at/above configured threshold.
11. Critical/high contract or token risk deny.
12. Unknown calldata/selector deny.
13. Unknown chain deny.
14. No matching explicit allow rule means deny.

### Layer 2 — wallet-level enforcement

The wallet provider independently enforces what the wallet/signer may do. For Privy, the current official policy model supports default deny, chain and recipient/contract conditions, calldata/function/parameter constraints, transfer limits, time-bounded signers, key quorums, and stateful aggregations.

MVP wallet policy should allow only:

- Monad testnet chain ID `10143` during testnet development; mainnet `143` is a separate policy and explicit release step.
- The pinned USDC token contract for an exact `approve(spender, amount)` bounded by configured raw units.
- The pinned Kuru router/market or selected protocol entrypoint and only the required swap function(s).
- Output recipient equal to the agent wallet.
- Per-call raw token/native amounts below a conservative cap.
- A short-lived agent authorization key/signer.

Explicitly deny or omit:

- `exportPrivateKey`, `exportSeedPhrase`, unrestricted `personal_sign`, unrestricted typed-data signing, arbitrary recipients, arbitrary contracts, wildcard methods, unlimited approvals, policy mutation, signer mutation, and unknown chain IDs.

## Honest limits of Layer 2

Wallet policy cannot natively understand every semantic concept. Dynamic USD value, portfolio allocation, token risk, market volatility, liquidity, and oracle freshness remain Layer 1 concerns. Wallet rules should duplicate the subset expressible in raw transaction fields and decoded ABI parameters.

Privy documentation states policy rules are generally evaluated in the secure enclave, while other checks such as compliance screening or simulation can occur outside it. Stateful aggregation also has a concurrency caveat: multiple concurrent requests can pass before earlier successful signatures update the aggregate. Therefore:

- Do not market every Privy check as cryptographically enforced.
- Serialize/reserve spend in Alice Guard before signing.
- Combine rolling limits with a small per-transaction cap and low wallet balance.
- Verify the exact enforcement location and behavior for the final methods used before submission.

## Wallet separation

| Wallet | Purpose | Alice access | Funding |
|---|---|---|---|
| Cold wallet | Long-term assets | None; no address/key import required | User-controlled; out of scope |
| Agent wallet | Future constrained production execution | Scoped signer only | Limited operational float |
| Dev/test wallet | Hackathon and testnet | Dedicated development credentials | Test tokens or disposable minimal mainnet funds |

No code path may scan the filesystem for personal wallet keys or seed phrases. A development key, if temporarily required before Privy integration, must be newly generated for this project, stored outside the repository, funded minimally, and replaced before public deployment.

## Secret handling

- `.env`, local databases containing credentials, authorization private keys, and provider secrets are Git-ignored.
- Secrets are read only by the wallet/provider adapter process and never included in LLM inputs or audit payloads.
- Error normalization removes headers, request signatures, JWTs, RPC credentials, and environment values.
- Frontend receives wallet address and opaque IDs only; app secrets stay server-side.
- CI uses repository secret storage and runs secret scanning.

## Policy evaluation semantics

```text
invalid/missing input                       => DENY
any explicit deny rule                     => DENY
no explicit allow match                    => DENY
approval-required match without approval   => REQUIRE_APPROVAL
approval hash/expiry mismatch               => DENY
all required allow rules satisfied          => ALLOW
```

Decisions include stable machine codes, human-readable reasons, rule IDs, policy version/hash, and evidence references. Floating-point arithmetic is forbidden for amounts and limits; use integer base units or canonical decimal strings with explicit rounding direction.

## Execution safeguards

1. Generate a candidate plan deterministically from an approved intent.
2. Decode all calldata using a pinned ABI.
3. Compare target, selector, tokens, amount, recipient, minimum output, deadline, and spender.
4. Reject extra calls and hidden value transfers.
5. Simulate against the intended chain and a recent block.
6. Refresh balance, quote/price freshness, gas reserve, daily reservation, and policy version.
7. Invalidate approval if the plan changes.
8. Submit with an idempotency key.
9. Reconcile receipt and record final status; a timeout is `UNKNOWN`, not an automatic retry signal.

## Emergency controls

- Global execution kill switch defaults off in development and requires explicit enabling.
- Per-chain and per-protocol kill switches.
- Ability to revoke agent signer/authorization key and remove wallet funding.
- Circuit breaker on repeated provider errors, risk spikes, or audit reconciliation mismatch.
- Read-only/demo mode that exercises the full decision chain without signing.

