# Phase 1 Research: Runtime Enforcement and Agent Security

Research cutoff: **2026-09-13, Asia/Shanghai**. Papers and young repositories are design evidence, not dependencies or production guarantees.

## What was reviewed

| Source | Useful idea | Alice Guard adoption |
|---|---|---|
| [Cedar](https://github.com/cedar-policy/cedar) | Policies are independently analyzable; schema validation, default deny, and explicit forbid semantics reduce authorization ambiguity. | Adopt deny-by-default, deny precedence, typed rules, complete evaluation traces, and policy-coverage validation. Do not add Cedar runtime to the one-developer MVP yet. |
| [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit/tree/main/agent-governance-typescript) | Unknown actions and failed external policy backends fail closed. | Unknown or missing rule coverage denies; Phase 1 engine has no external backend. |
| [CPEX](https://github.com/contextforge-org/cpex) | A deterministic reference monitor sits between an agent and every capability, with security state hidden from the model and pre/post enforcement. | Preserve Plan Guard as the only route to state-changing wallet actions; add pre-signing reevaluation later. |
| [Safe policy-engine](https://github.com/safe-research/policy-engine) | Single-use grants and spend state must be atomic and roll back on failed execution. | Count reservations in rolling spend now; implement transactional reservation/commit/release in Phase 5. |
| [AgentSpec](https://github.com/haoyuwang99/AgentSpec) and its [ICSE 2026 paper](https://arxiv.org/abs/2503.18666) | Runtime rules separate trigger, predicate, and enforcement response such as stop or user inspection. | Every rule produces `pass`, `deny`, `require_approval`, or `skipped`, plus a stable reason code. |
| [CaMeL](https://arxiv.org/abs/2503.18813) | Extract control/data flow from trusted user requests; untrusted retrieved data must not control program flow; use capabilities. | The future LLM parser can only emit a narrow intent and never gets wallet/RPC capabilities. External metadata is evidence, never instruction. |
| [AgentDojo](https://github.com/sequrity-ai/agentdojo) | Security evaluations need realistic adversarial and adaptive cases rather than only a fixed happy path. | Add mutation-style boundary tests and later an injection corpus; measure false denials as well as blocked attacks. |
| [PCAS](https://arxiv.org/abs/2602.16708) | A reference monitor plus a causal dependency graph supports deterministic policy over transitive information flow. | Domain reasons already reference evidence IDs. A full causal graph is deferred until multi-step/multi-agent workflows exist. |
| [ROPE](https://github.com/xhOwenMa/ROPE) / [paper](https://arxiv.org/abs/2608.27496) | Sensitive state-changing parameters should be admitted only when their value has an acceptable, auditable origin. | Phase 3 will bind chain, token, contract, recipient, amount, and deadline to pinned config/user intent evidence. Model or webpage origin will never be accepted for these fields. |
| [Monad Agent Kit](https://github.com/stakeme-team/monad-agent-kit) | Separating transaction preparation, signing, broadcast, and confirmation makes onchain actions inspectable. | Maintain separate planner, Plan Guard, wallet adapter, and reconciliation stages; do not import its broad transaction surface. |

## Algorithmic decisions for Phase 1

### Policy evaluation

Evaluate every enabled constraint and retain a trace. Combine results using:

```text
any DENY               => DENY
else any REQUIRE_APPROVAL => REQUIRE_APPROVAL
else complete required coverage and all PASS => ALLOW
else                   => DENY
```

This is intentionally not an LLM classifier. Policy order cannot change the verdict, and missing a required rule category is itself a denial.

### Risk aggregation

Risk signals—including amount, balance, reserve, allocation, freshness, liquidity, volatility, slippage, token, contract, and destination risk—use explicit integer weights and clamp to `0..100`. Missing or invalid execution-critical evidence contributes a critical score; warning signals contribute lower, reviewable scores. Threshold mapping is deterministic:

```text
0..29   low       -> continue
30..69  medium    -> require approval
70..89  high      -> deny
90..100 critical  -> deny
```

The first version favors explainability over statistical sophistication. No paper justifies pretending this score is a probability of loss.

### Numeric safety

All asset quantities use integer base-unit strings. Decimal policy values use canonical strings and `bigint` scale alignment. JavaScript floating point is never used for money or limit comparison.

### Provenance and auditability

Every risk reason carries evidence identifiers; every policy rule emits a deterministic trace and stable reason code. This is the minimal foundation for ROPE/PCAS-style provenance without prematurely building a graph engine.

## Deliberately deferred

- No Datalog, Cedar, Rego, information-flow interpreter, probabilistic model checker, or LLM-generated policy in the MVP.
- No direct dependency on young agent-security repositories.
- No prompt-injection detector as the security boundary.
- No algorithmic trading, price prediction, or learned risk model.

These can be reconsidered only after the single-action pipeline is working and a concrete limitation is measured.
