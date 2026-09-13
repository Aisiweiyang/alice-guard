# Architecture Proposal

## Recommendation

Build a modular monolith with ports and adapters, not microservices and not an initial monorepo. Keep the security-critical domain and engines free of network calls. External systems provide typed snapshots; pure functions evaluate those snapshots.

## End-to-end architecture

```text
 UNTRUSTED                         ALICE GUARD TRUSTED COMPUTE
┌──────────────┐  TB-1   ┌───────────────────────────────────────────────┐
│ User text /  │────────>│ Request Gateway + canonical request envelope │
│ external text│         └──────────────────────┬────────────────────────┘
└──────────────┘                                │
                                                v
                         ┌─────────────────────────────────┐
                         │ LLM Intent Parser (untrusted    │
                         │ proposal; no tools or calldata) │
                         └──────────────────┬──────────────┘
                                            │ TB-2 JSON only
                                            v
                         ┌─────────────────────────────────┐
                         │ Zod Schema Validator            │
                         │ unsupported/invalid => DENY     │
                         └──────────────────┬──────────────┘
                                            │ typed AgentIntent
                                            v
 SEMI-TRUSTED            ┌─────────────────────────────────┐
┌──────────────┐  TB-3   │ Trusted Asset Resolver          │
│ RPC / oracle │────────>│ + Snapshot Collector            │
│ DEX quote API│         │ (addresses from signed/pinned   │
└──────────────┘         │ configuration, never from LLM) │
                         └──────────────────┬──────────────┘
                                            │ immutable evidence bundle
                         ┌──────────────────v──────────────┐
                         │ Deterministic Risk Engine       │
                         │ score + level + reasons         │
                         └──────────────────┬──────────────┘
                                            v
                         ┌─────────────────────────────────┐
                         │ Deterministic Policy Engine     │
                         │ DENY > REQUIRE_APPROVAL > ALLOW │
                         └───────┬─────────────────┬───────┘
                                 │ DENY            │
                                 v                 v
                         ┌──────────────┐  ┌────────────────────────────┐
                         │ Audit final │  │ Deterministic Tx Planner   │
                         └──────────────┘  │ via one protocol adapter   │
                                           └──────────────┬─────────────┘
                                                          │ TB-4 candidate tx
                                                          v
                                           ┌────────────────────────────┐
                                           │ Plan Guard                 │
                                           │ decode calldata; compare   │
                                           │ chain/to/function/args,    │
                                           │ quote expiry; simulate;    │
                                           │ re-run risk + policy       │
                                           └───────┬────────────┬───────┘
                                                   │ deny       │ valid
                                                   v            v
                                               Audit      ┌───────────────┐
                                                          │ Human approval│
                                                          │ when required │
                                                          └───────┬───────┘
                                                                  │ TB-5 signed approval
                                                                  v
 EXTERNAL SECURITY BOUNDARY                         ┌────────────────────────┐
┌───────────────────────────┐  TB-6                │ Wallet Adapter          │
│ Privy policy / enclave /  │<─────────────────────│ idempotent execution    │
│ authorization key/quorum  │                      └───────────┬────────────┘
└──────────────┬────────────┘                                  │ signed tx
               │                                               v
               └──────────────────────────────────────>┌─────────────────┐
                                                      │ Monad RPC / chain│
                                                      └────────┬────────┘
                                                               │ receipt/events
                                                               v
                                                      ┌─────────────────┐
                                                      │ Append-only     │
                                                      │ Audit Store     │
                                                      └─────────────────┘
```

## Trust boundaries

| Boundary | Crossing | Rule |
|---|---|---|
| TB-1 | User/web/API text → request gateway | Treat all text as data; size-limit, encode, authenticate, rate-limit. |
| TB-2 | LLM output → validator | Accept only strict JSON matching the executable intent schema; validation failure is terminal. |
| TB-3 | RPC/oracle/DEX → snapshot collector | Validate types, chain IDs, addresses, timestamps, block references, freshness, and consistency; external metadata cannot alter instructions. |
| TB-4 | DEX/planner output → Plan Guard | Candidate calldata is untrusted until decoded and proven equivalent to the approved intent and pinned contract ABI/config. |
| TB-5 | UI/user → approval service | Approval binds request ID, plan hash, policy hash, expiry, and approver identity; any plan change invalidates approval. |
| TB-6 | Backend → wallet provider | Wallet-level policy independently restricts chain, target, method/parameters, raw amounts, signer, and time. Use idempotency keys. |

## Component responsibilities

### Intent Parser

- Input: one user request envelope.
- Output: a high-level `AgentIntent` only.
- No RPC access, wallet access, token discovery, contract selection, ABI choice, quote selection, or calldata generation.
- MVP supports only `swap_exact_in`; every other action is an explicit schema rejection.

### Asset Resolver and Snapshot Collector

- Resolve symbols only through a pinned allowlisted asset registry.
- Capture wallet balances, spend-to-date, price/oracle timestamps, quote, liquidity indicators, block number/hash, configuration version, and source timestamps.
- Produce an immutable evidence object so risk and policy tests are reproducible.

### Risk Engine

- Pure deterministic function: `intent + evidence + riskConfig -> RiskAssessment`.
- Describes danger; it does not grant permission.
- Missing/stale evidence produces high or critical risk and a fail-closed recommendation.

### Policy Engine

- Pure deterministic function: `intent + evidence + risk + policy -> PolicyDecision`.
- Precedence: any deny rule wins; otherwise approval-required wins; otherwise allow; no matching allow means deny.
- Emits stable reason codes, evaluated rule IDs, policy version, and evidence references.

### Transaction Planner and Plan Guard

- The adapter may obtain a quote/build response, but the Plan Guard independently decodes every transaction.
- Require exact chain, target contract, function selector, token addresses, input amount, output recipient, deadline, and minimum output consistent with the approved intent/quote.
- Token approval uses exact amount and approved spender; unlimited approvals are forbidden in MVP.
- Simulate, then refresh time-sensitive evidence and rerun risk/policy before signing to limit TOCTOU risk.

### Wallet Adapter

- The only component allowed to request a signature/broadcast.
- Receives only a sealed, approved `TransactionPlan`, never raw model output.
- Maps Alice policies to provider-native wallet policies where expressible.
- Has no interface for key export or arbitrary message signing in MVP.

### Audit Store

- Record every transition, including parse/schema failures and provider errors.
- Redact secrets and authorization material.
- Store canonical hashes of intent, evidence, policy, plan, approval, and execution result.

## State machine

```text
RECEIVED
  -> PARSE_REJECTED | VALIDATED
VALIDATED
  -> RISK_REJECTED | POLICY_DENIED | POLICY_ALLOWED | APPROVAL_REQUIRED
POLICY_ALLOWED / APPROVAL_REQUIRED+APPROVED
  -> PLAN_REJECTED | PLAN_VALIDATED
PLAN_VALIDATED
  -> PRE_EXECUTION_DENIED | SIGNING | EXECUTED | EXECUTION_FAILED
```

Terminal states cannot be reopened. Retries create a new execution attempt under the same request and idempotency key, without silently reusing expired evidence or approval.

