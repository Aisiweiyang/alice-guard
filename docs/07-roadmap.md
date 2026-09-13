# Phase 0–8 Delivery Roadmap

## Operating rule

Each phase is a security gate. A later phase may begin only when the previous phase's definition of done is met. Mainnet is a separate release decision, not the natural conclusion of the roadmap.

## Phase 0 — Research and design

**Objective:** turn the Alice Guard idea into an evidence-backed, buildable security architecture.

**Files:** `README.md`, `docs/01-product-vision.md` through `docs/09-open-questions.md`, `src/domain/schemas.ts`.

**Implementation steps:**

1. Verify Monad, Privy, Chainlink, and candidate DeFi capabilities against official sources.
2. Define trust boundaries, adversaries, assets, security invariants, and failure states.
3. Separate semantic policy from wallet-enforced permissions.
4. Bound the demo to one action, chain, route, and controlled wallet.
5. Define the domain contracts, repository shape, and phase gates.

**Test criteria:** every external claim has an official source; every untrusted boundary has validation; every signing path crosses risk, policy, Plan Guard, and wallet policy; required schemas parse valid fixtures and reject invalid conceptual examples during Phase 1 setup.

**Definition of done:** all Phase 0 artifacts exist; unresolved product choices are explicit; no live key, funded wallet, or transaction broadcast is introduced.

**Primary risks:** documentation becoming stale; confusing registry presence with protocol safety; leaving a semantic rule unenforceable without stating it.

## Phase 1 — Local policy engine

**Objective:** produce deterministic risk and policy decisions with no network, wallet, or LLM dependency.

**Files:** `package.json`, `tsconfig.json`, `src/domain/*`, `src/engines/risk-engine.ts`, `src/engines/policy-engine.ts`, `src/config/policies.ts`, `tests/unit/*`, `tests/fixtures/*`.

**Implementation steps:**

1. Bootstrap strict TypeScript, Zod, Vitest, linting, and a committed lockfile.
2. Implement canonical token/USD arithmetic without floating point.
3. Implement evidence freshness, size, allocation, velocity, reserve, and slippage risk signals.
4. Implement default-deny policy evaluation with stable reason codes.
5. Add an injected clock and deterministic configuration hashing.

**Test criteria:** table-driven tests cover exact limits and one unit below/above; stale/missing/conflicting evidence; unknown asset/action/chain; daily-cap rollover; insufficient gas reserve; high-risk denial; approval threshold; repeated input produces byte-equivalent canonical output.

**Definition of done:** the engine has no I/O imports; all stated Layer 1 rules have positive and negative tests; unknown or malformed inputs fail closed; risk and policy remain separate outputs.

**Primary risks:** decimal/rounding errors, UTC window mistakes, ambiguous units, and accidentally treating absent data as zero risk.

## Phase 2 — Agent intent parser

**Objective:** let an LLM propose a narrow intent while proving it cannot authorize or construct a transaction.

**Files:** `src/application/parse-request.ts`, `src/application/ports.ts`, `src/adapters/llm/*`, `src/config/parser.ts`, `tests/security/prompt-injection.test.ts`, `tests/fixtures/llm/*`.

**Implementation steps:**

1. Define `LLMProvider.parseIntent(): Promise<unknown>`.
2. Prompt with only the allowed action and asset vocabulary.
3. Validate locally with `AgentIntentSchema`; canonicalize only after validation.
4. Store sanitized raw output and validation issues for audit.
5. Return a refusal/clarification state for ambiguity; never infer a dangerous default.

**Test criteria:** adversarial prompts requesting keys, arbitrary calldata, another chain, unlimited approval, hidden recipient, policy override, or injected tool use are rejected; prose variants map to the same intent; provider errors never reach signing code.

**Definition of done:** the parser has no wallet, RPC, ABI, address book, or signing capability; its output cannot contain contract, recipient, calldata, or policy-decision fields.

**Primary risks:** prompt injection, schema-shaped malicious content, provider format drift, and logging sensitive user text.

## Phase 3 — Monad read/plan integration

**Objective:** collect trusted evidence and build a transaction plan that is decoded, simulated, and still unable to sign.

**Files:** `src/adapters/monad/*`, `src/adapters/kuru/*`, `src/adapters/price/*`, `src/config/{networks,assets,contracts}.ts`, `src/application/build-plan.ts`, `src/application/plan-guard.ts`, `tests/integration/*`.

**Implementation steps:**

1. Re-verify chain ID, reset history, assets, router/market addresses, ABI, and source metadata.
2. Connect read-only RPC and assert returned chain ID before any protocol call.
3. Resolve USDC/MON from a versioned allowlist; obtain quote and timestamped price evidence.
4. Build at most the exact approval plus exact-input swap needed for the MVP.
5. Decode calldata locally, compare every semantic field to the approved intent, check quote expiry, simulate, then re-run risk and policy on final values.

**Test criteria:** wrong-chain RPC, stale quote, changed recipient/router/token/amount/min-output/deadline, unknown selector, revert, excessive gas limit, bad decimals, and manipulated API responses all fail closed; happy-path simulation produces a stable plan hash.

**Definition of done:** a CLI can show `request → intent → evidence → risk → policy → validated plan → simulation` without possessing signing authority.

**Primary risks:** testnet reset/address drift, weak liquidity, router/proxy upgrades, dynamic aggregator calldata, Monad gas charged by gas limit, and quote/simulation TOCTOU.

## Phase 4 — Privy wallet and Layer 2 policy

**Objective:** prove that the wallet independently denies transactions outside a minimal permission envelope.

**Files:** `src/adapters/privy/*`, `src/config/wallet-policy.ts`, `scripts/setup-demo-wallet.ts`, `scripts/revoke-demo-wallet.ts`, `tests/security/wallet-policy-bypass.test.ts`, `.env.example`.

**Implementation steps:**

1. Create a new dedicated testnet wallet; never import a treasury or personal key.
2. Apply chain, contract, recipient, function, parameter, value, expiry, and rate/amount controls supported by Privy.
3. Keep semantic USD/freshness/allocation rules in Layer 1 and document the enforcement mapping.
4. Serialize spend reservations in application storage to close stateful-policy concurrency gaps.
5. Implement revocation and a kill switch before funding.

**Test criteria:** direct attempts using wrong chain, router, recipient, selector, token, spender, amount, value, or expired permission are rejected at the wallet layer; concurrent requests cannot exceed the app cap; authorization keys never appear in logs.

**Definition of done:** allowed simulated plan can be authorized; every negative-bypass fixture is denied even if Layer 1 is hypothetically bypassed; revoke/disable procedure is rehearsed.

**Primary risks:** Privy policy feature mismatch on Monad testnet, parameter coverage gaps, aggregation races, over-broad authorization keys, and secret exposure.

## Phase 5 — Controlled testnet execution

**Objective:** broadcast one bounded testnet swap with idempotency, reconciliation, and complete audit evidence.

**Files:** `src/application/execute-plan.ts`, `src/application/reconcile.ts`, `src/adapters/sqlite/*`, `src/cli/*`, `tests/e2e/testnet/*`.

**Implementation steps:**

1. Persist request, evidence, decisions, plan hash, approval state, and spend reservation before signing.
2. Recheck expiry, chain state, balances, allowance, simulation, risk, policy, and plan hash immediately before submission.
3. Obtain a one-time human approval when required, cryptographically bound to the plan and expiry.
4. Submit idempotently and track pending/confirmed/reverted/unknown states.
5. Reconcile receipt and balances; append audit events and release/commit reservations transactionally.

**Test criteria:** duplicate clicks, restart after broadcast, dropped/replaced transaction, timeout, revert, reorg/receipt disappearance, expired approval, changed plan, and unknown outcome do not cause duplicate execution or false success.

**Definition of done:** one explorer-verifiable testnet swap succeeds; a complete redacted audit record can reconstruct why it was allowed; retrying the same request cannot create a second spend.

**Primary risks:** partial failure, uncertain transaction state, approval replay, nonce contention, and price movement between simulation and inclusion.

## Phase 6 — Minimal control-room UI

**Objective:** make the safety reasoning and execution state understandable in a short live demo.

**Files:** `src/app/*`, UI components for request, decision trace, approval, execution, and audit timeline; UI tests.

**Implementation steps:**

1. Add a three-panel flow: request, deterministic decision, execution/audit.
2. Show risk reasons, policy rule outcomes, data freshness, limits, and exact transaction meaning.
3. Require explicit confirmation for approval-gated plans; disable confirmation on expiry/change.
4. Show pending and unknown states honestly; link confirmed hashes to the correct explorer.
5. Keep all policy enforcement server-side.

**Test criteria:** keyboard and narrow-screen usability; expired or mutated plan cannot be approved; UI cannot submit arbitrary calldata or bypass server checks; error states reveal no secrets.

**Definition of done:** a new reviewer can understand what Alice proposed, why Guard allowed/denied it, what the wallet permitted, and what the chain finalized.

**Primary risks:** UI implying stronger guarantees than exist, approval fatigue, client-side trust, and demo latency.

## Phase 7 — Security and demo hardening

**Objective:** convert the happy path into a resilient, reproducible hackathon build.

**Files:** `tests/security/*`, CI configuration, dependency/secret scanning configuration, runbooks, architecture and demo updates.

**Implementation steps:**

1. Run the threat-model test matrix and property/fuzz tests for amounts and policy boundaries.
2. Pin dependencies and official address/ABI source revisions; scan repository and history for secrets.
3. Test kill switch, wallet revocation, degraded oracle/RPC, rate limiting, and recovery.
4. Re-verify official hackathon rules, required sponsor technology, submission format, and deadlines.
5. Rehearse a deterministic demo with a pre-funded low-value wallet and a recorded fallback.

**Test criteria:** all negative security cases pass; clean-machine setup works; source freshness is recorded; no critical/high dependency finding remains unexplained; recovery runbook succeeds.

**Definition of done:** release checklist is signed off; demo completes within the target time; fallback proves the decision/audit story without pretending a failed live transaction succeeded.

**Primary risks:** last-minute SDK/address changes, faucet/RPC outage, supply-chain alerts, unreliable live liquidity, and submission-rule mismatch.

## Phase 8 — Submission package

**Objective:** present a precise, credible security product rather than a collection of integrations.

**Files:** final `README.md`, setup/demo guide, pitch deck, architecture graphic, threat-model excerpt, demo video/script, submission form assets.

**Implementation steps:**

1. Lead with the problem, invariant, two-layer enforcement, and one end-to-end proof.
2. Document exactly which guarantees are implemented, demonstrated, deferred, or assumed.
3. Include official technology references and explorer/audit evidence.
4. Record a concise backup video and validate every public link on a clean browser.
5. Freeze code except for release-blocking fixes.

**Test criteria:** a reviewer can reproduce setup; every claim maps to code/test/evidence; links and video work; no secrets, personal wallet data, or unsupported security claim is published.

**Definition of done:** the submission is accepted by the official portal and the repository is tagged; wallet funds remain bounded and credentials can be revoked after judging.

**Primary risks:** overclaiming, broken public assets, leaking operational details, scope creep, and late mainnet pressure.

