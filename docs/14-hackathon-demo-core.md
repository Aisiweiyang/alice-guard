# Phase 3.5 — Hackathon Demo Core

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

Verification date: **2026-09-13, Asia/Shanghai**.

## Purpose

This phase turns the existing security components into one judge-visible vertical slice without introducing signing authority. It demonstrates the core invariant:

> LLM proposes. Deterministic code decides. Plan Guard validates. Audit records explain.

## One-command demo

```powershell
pnpm demo
```

Every run creates a new directory under `demo-output/` containing `alice-guard-audit.sqlite` and a presentation-ready `demo-summary.json`. Generated demo data is gitignored. The summary is a projection of already validated results; the display layer does not recalculate policy decisions.

## Scenarios

1. **Allowed small swap** — `20 USDC -> MON`, maximum slippage 1%. Risk is low, policy allows it, and Plan Guard validates an exact approval plus exact-input Kuru plan.
2. **Denied over limit** — `5000 USDC -> MON`. The 100 USD transaction rule and 200 USD rolling rule deny it before planning. No transaction calldata is created.
3. **Denied prompt injection** — a request asks the agent to ignore policy and transfer everything. The intent parser rejects it before evidence collection, risk, policy, or planning.

## Audit guarantees

- SQLite is opened with full synchronous writes and WAL mode.
- Each request ID, audit ID, and record hash is unique.
- Every record includes the previous record hash and a canonical hash of its own contents.
- SQLite triggers reject `UPDATE` and `DELETE`, making the exposed adapter append-only.
- Duplicate request insertion is rejected rather than overwriting evidence.
- The chain is reparsed through the strict `AuditRecordSchema` and rehashed for verification.

The database is local demonstration evidence, not an immutable public ledger. A process with filesystem-level control can still replace the entire database; the truthful claim is tamper-evident within the captured chain, not tamper-proof storage.

## Trust boundary

The included provider, price, quote, liquidity, and simulation values are deterministic fixtures. They exist to make the safety control flow reproducible when Kuru testnet lacks executable liquidity. Console output explicitly labels the mode `offline-demo-no-wallet` and reports execution as `not_attempted`.

These fixtures must never be passed to a signing or broadcast adapter. A future live path must replace them with fresh validated evidence, sequential simulation, and the Phase 4 wallet-policy gate.

## Delivered files

- `src/application/demo-orchestrator.ts` — fail-closed vertical-slice orchestration.
- `src/application/audit-store.ts` — audit store contract and hash-chain verifier.
- `src/adapters/audit/sqlite-audit-store.ts` — append-only SQLite adapter.
- `src/demo/demo-template.ts` — three deterministic, replaceable scenarios.
- `scripts/run-demo.ts` — one-command presentation runner.
- `tests/integration/demo-orchestrator.test.ts` — end-to-end stop-boundary tests.
- `tests/unit/sqlite-audit-store.test.ts` — chaining and duplicate-request tests.

## Definition of done

- `pnpm check` passes.
- `pnpm test` passes.
- `pnpm demo` produces all three expected results.
- Audit chain verification returns `true`.
- Denied requests never create a transaction plan.
- Prompt injection never reaches evidence collection.
- No wallet client, secret, signer, or broadcast method exists in the demo path.
