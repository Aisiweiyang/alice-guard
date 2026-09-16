# Phase 4C — Judge-visible Privy live evidence

Verification date: **2026-09-15, Asia/Shanghai**.

## Outcome

Phase 4C makes the completed Privy integration visible without giving the browser, demo server, or deterministic scenario path any signing or broadcast capability. It separates two facts that must not be conflated:

1. a dedicated Privy wallet exists and is protected by the expected policy;
2. Alice Guard execution is still disabled and no transaction is attempted.

The live status combines three independently validated sources:

- Git-ignored public provisioning state;
- Privy GET responses for the policy and wallet binding;
- same-block Monad testnet native MON and Kuru USDC balances.

## Commands

```powershell
pnpm demo:web:live
pnpm evidence:privy
```

`demo:web:live` starts the localhost judge UI and enables only the read-only status provider. `evidence:privy` writes a timestamped, redacted `privy-live-status.json` under the Git-ignored `demo-output/` directory.

The ordinary `pnpm demo:web` remains fully offline and returns `NOT_CONFIGURED` for the live status endpoint.

## Safe API

`GET /api/privy/status` returns only:

- public Privy policy/wallet IDs;
- public EVM address and owner ID;
- expected and observed policy hashes;
- binding, owner and archive state;
- Monad block number and raw MON/USDC balances;
- check timestamp, safe reason code and fixed capability flags.

It never returns the Privy App Secret, authorization private key, authorization context, raw provider errors, request headers, filesystem paths or environment values. Browser rendering uses DOM `textContent`; the explorer link is constructed only from a schema-pinned explorer origin and a validated EVM address.

## Failure behavior

- Missing public state: `NOT_CONFIGURED`.
- Local state, app fingerprint, owner or policy hash mismatch: `DEGRADED` and no Privy binding request.
- Privy timeout/error: `DEGRADED`, remote binding `UNAVAILABLE`.
- Monad RPC timeout/error: `DEGRADED`, balances `UNAVAILABLE`.
- Any provider exception is replaced with a stable safe reason code.
- Remote calls have a bounded timeout and successful projections use a short cache.

Every response fixes `signing`, `broadcast` and `funding` to `false`. The status endpoint cannot accept a request body or transaction fields.

## Verified public resources

- Policy ID: `mx1nnjw8cs4jlh0hzenclu6q`
- Wallet ID: `gpqzfry67wit2ef7qajovkot`
- Wallet address: `0x73180c3581933490E2108036C8F89b0224B87285`
- Owner ID: `vr277t5pq4j4wvvo7oxuafye`
- Policy hash: `0x77b1ce7652daf32b89dea09c4644d0b31885cd8aad140f8e1c341b81c52c72dc`
- Initial MON balance: `0`
- Initial Kuru USDC balance: `0`

These are public identifiers, not credentials. The App Secret and authorization private key remain only in `.env.local`, which is Git ignored and ACL-restricted.

## Next gate

Phase 4D may attempt attributable Privy policy-denial evidence only after a separate review proves that each negative request cannot accidentally sign or broadcast. The wallet must remain unfunded until that review and a new explicit user confirmation are complete.
