import { z } from "zod";
import { DecisionCandidateSchema, DecisionMaterialSchema, createDecisionCapsule, computeDecisionCapsuleHash, type DecisionMaterial } from "../domain/decision-capsule";
import { hashCanonical } from "../domain/hash";
import { evaluateRisk } from "../engines/risk-engine";
import { evaluatePolicy } from "../engines/policy-engine";
import { validateKuruPlan } from "./plan-guard";
import { verifyProposalOrigin } from "./request-origin-guard";
import { validateExecutionEnvelope } from "../domain/execution-envelope";
import { compareUnsignedDecimals, toScaledInteger } from "../domain/canonicalize";
import { KURU_TESTNET_USDC, MONAD_TESTNET_NATIVE_MON } from "../config/assets";
import { KURU_TESTNET } from "../config/contracts";
import type { EvidenceItem } from "../domain/schemas";

export const VerificationOptionsSchema = z.object({
  now: z.string().datetime({offset: true}), mode: z.enum(["proposal", "execution"]),
  autonomyState: z.enum(["OBSERVE_ONLY", "PROPOSE_ONLY", "APPROVAL_REQUIRED", "RESTRICTED_EXECUTION", "PAUSED", "EMERGENCY_STOP"]),
  nonceStatus: z.enum(["UNUSED", "CONSUMED", "UNAVAILABLE"]),
  walletPolicyStatus: z.enum(["MATCHED", "DRIFTED", "NOT_CONFIGURED", "UNAVAILABLE"]),
  budgetStatus: z.enum(["NOT_RESERVED", "RESERVED", "UNAVAILABLE"]),
}).strict();
export type VerificationOptions = z.infer<typeof VerificationOptionsSchema>;
export interface ProofVerification { ok: boolean; reasonCodes: string[]; executionAuthorized: false }

/** Server-owned inputs still need coherent references and fresh facts. */
function verifyMaterialFacts(m: DecisionMaterial, now: number): string[] {
  const reasons: string[] = [];
  const evidence = new Map(m.evidence.map(item => [item.evidenceId, item]));
  const roles: Array<[keyof DecisionMaterial["riskFacts"]["evidenceIds"], EvidenceItem["kind"]]> = [
    ["balance", "balance"], ["gas", "gas"], ["price", "price"], ["quote", "quote"],
    ["liquidity", "quote"], ["token", "configuration"], ["contract", "configuration"], ["destination", "configuration"],
  ];
  for (const [role, kind] of roles) {
    const id = m.riskFacts.evidenceIds[role];
    const item = id === null ? undefined : evidence.get(id);
    if (!item) reasons.push("EVIDENCE_REFERENCE_MISSING");
    else if (item.kind !== kind) reasons.push("EVIDENCE_KIND_MISMATCH");
  }
  const quoteEvidence = evidence.get(m.riskFacts.evidenceIds.quote ?? "");
  if (quoteEvidence && (quoteEvidence.valueHash !== hashCanonical(m.quote) || quoteEvidence.blockNumber !== m.quote.blockNumber)) {
    reasons.push("QUOTE_EVIDENCE_MISMATCH");
  }
  const priceEvidence = evidence.get(m.riskFacts.evidenceIds.price ?? "");
  if (priceEvidence && m.riskFacts.priceObservedAt !== priceEvidence.observedAt) reasons.push("PRICE_FACTS_MISMATCH");
  try {
    const amount = toScaledInteger(m.intent.amountIn, KURU_TESTNET_USDC.decimals).toString();
    if (m.riskFacts.amountInRaw !== amount || m.quote.amountInRaw !== amount) reasons.push("AMOUNT_FACTS_MISMATCH");
  } catch { reasons.push("AMOUNT_FACTS_MISMATCH"); }
  if (
    compareUnsignedDecimals(m.riskFacts.transactionUsd, m.policyFacts.transactionUsd) !== 0 ||
    m.riskFacts.nativeBalanceRaw !== m.policyFacts.nativeBalanceRaw ||
    m.riskFacts.estimatedGasCostRaw !== m.policyFacts.estimatedGasCostRaw ||
    m.riskFacts.postTradeAllocationBps !== m.policyFacts.postTradeAllocationBps
  ) reasons.push("RISK_POLICY_FACTS_MISMATCH");
  if (m.riskFacts.quoteObservedAt !== m.quote.observedAt || m.riskFacts.quoteExpiresAt !== m.quote.expiresAt) {
    reasons.push("QUOTE_FACTS_MISMATCH");
  }
  if (
    m.policyFacts.assetInId !== KURU_TESTNET_USDC.assetId ||
    m.policyFacts.assetOutId !== MONAD_TESTNET_NATIVE_MON.assetId ||
    m.policyFacts.contractId !== KURU_TESTNET.contractId ||
    m.policyFacts.slippageBps !== m.intent.maxSlippageBps ||
    (m.plan !== null && m.policyFacts.recipient.toLowerCase() !== m.plan.walletAddress.toLowerCase())
  ) reasons.push("POLICY_TARGET_FACTS_MISMATCH");

  const receivedAt = Date.parse(m.request.receivedAt);
  const parsedAt = Date.parse(m.intent.parsedAt);
  const assessedAt = Date.parse(m.riskAssessment.assessedAt);
  const decidedAt = Date.parse(m.policyEvaluation.decision.decidedAt);
  if (parsedAt < receivedAt || assessedAt < parsedAt || decidedAt < assessedAt || now < decidedAt) {
    reasons.push("DECISION_TIME_INCONSISTENT");
  }
  const elapsedSeconds = Math.max(0, (now - decidedAt) / 1_000);
  const ageSeconds = (time: string): number => (now - Date.parse(time)) / 1_000;
  if (m.riskFacts.priceObservedAt !== null && ageSeconds(m.riskFacts.priceObservedAt) > m.riskConfig.maxPriceAgeSeconds) {
    reasons.push("RISK_PRICE_TOO_OLD");
  }
  if (m.riskFacts.quoteObservedAt !== null && ageSeconds(m.riskFacts.quoteObservedAt) > m.riskConfig.maxQuoteAgeSeconds) {
    reasons.push("RISK_QUOTE_TOO_OLD");
  }
  for (const rule of m.policy.rules) {
    if (!rule.enabled || rule.type !== "max_data_age_seconds") continue;
    const recordedAge = m.policyFacts.evidenceAgeSeconds[rule.evidenceKind];
    const matching = m.evidence.filter(item => item.kind === rule.evidenceKind);
    if (recordedAge === null || matching.length === 0) {
      reasons.push("POLICY_EVIDENCE_MISSING");
      continue;
    }
    // Evaluate both the original snapshot's elapsed age and actual observation
    // timestamps; freshUntil alone must not relax configured freshness limits.
    const actualAge = Math.max(recordedAge + elapsedSeconds, ...matching.map(item => ageSeconds(item.observedAt)));
    if (actualAge > rule.maxAgeSeconds) reasons.push("POLICY_EVIDENCE_TOO_OLD");
  }
  return reasons;
}

/** trusted/options are server-owned inputs, never accepted from an HTTP caller. */
export function verifyPreExecution(input: {candidate: unknown; trusted: unknown; options: unknown}): ProofVerification {
  const denied = (reasonCodes: string[]): ProofVerification => ({ok: false, reasonCodes: [...new Set(reasonCodes)], executionAuthorized: false});
  const c = DecisionCandidateSchema.safeParse(input.candidate);
  if (!c.success) return denied(["INVALID_CANDIDATE_SCHEMA"]);
  const t = DecisionMaterialSchema.safeParse(input.trusted);
  if (!t.success) return denied(["INVALID_TRUSTED_CONTEXT"]);
  const opts = VerificationOptionsSchema.safeParse(input.options);
  if (!opts.success) return denied(["INVALID_VERIFIER_OPTIONS"]);
  const {capsule, material: m} = c.data;
  const trusted = t.data;
  const o = opts.data;
  const reasons: string[] = [];
  const bindings: Array<[keyof DecisionMaterial, string]> = [
    ["request", "REQUEST_BINDING_MISMATCH"], ["intent", "INTENT_BINDING_MISMATCH"],
    ["evidence", "EVIDENCE_BINDING_MISMATCH"], ["riskFacts", "EVIDENCE_BINDING_MISMATCH"], ["policyFacts", "EVIDENCE_BINDING_MISMATCH"],
    ["provenance", "PROVENANCE_BINDING_MISMATCH"], ["riskConfig", "RISK_CONFIG_MISMATCH"], ["policy", "POLICY_DEFINITION_MISMATCH"],
    ["riskAssessment", "RISK_ASSESSMENT_MISMATCH"], ["policyEvaluation", "POLICY_DECISION_MISMATCH"],
    ["quote", "QUOTE_BINDING_MISMATCH"], ["simulations", "SIMULATION_BINDING_MISMATCH"], ["plan", "PLAN_BINDING_MISMATCH"],
    ["envelope", "ENVELOPE_BINDING_MISMATCH"], ["approval", "APPROVAL_BINDING_MISMATCH"], ["walletPolicyHash", "WALLET_POLICY_MISMATCH"],
  ];
  for (const [key, reason] of bindings) if (hashCanonical(m[key]) !== hashCanonical(trusted[key])) reasons.push(reason);
  if (computeDecisionCapsuleHash(capsule) !== capsule.capsuleHash) reasons.push("CAPSULE_HASH_MISMATCH");
  try {
    if (hashCanonical(createDecisionCapsule(m)) !== hashCanonical(capsule)) reasons.push("CAPSULE_MATERIAL_MISMATCH");
    if (hashCanonical(createDecisionCapsule(trusted)) !== hashCanonical(capsule)) reasons.push("TRUSTED_CAPSULE_MISMATCH");
  } catch { reasons.push("CAPSULE_MATERIAL_INVALID"); }
  const now = Date.parse(o.now);
  if (now >= Date.parse(capsule.decisionExpiresAt)) reasons.push("EXPIRED_CAPSULE");
  if (now < Date.parse(capsule.decisionCreatedAt) || now < Date.parse(m.request.receivedAt)) reasons.push("FUTURE_DECISION");
  if (new Set(m.evidence.map(e => e.evidenceId)).size !== m.evidence.length || m.provenance.length !== m.evidence.length ||
      new Set(m.provenance.map(p => p.evidenceId)).size !== m.provenance.length) reasons.push("INVALID_PROVENANCE");
  for (const e of m.evidence) {
    const p = m.provenance.find(p => p.evidenceId === e.evidenceId);
    if (!p || p.contentHash !== e.valueHash || p.observedAt !== e.observedAt || p.blockNumber !== e.blockNumber ||
        p.expiresAt !== e.freshUntil || p.trustClass !== "OFFLINE_FIXTURE" || p.validationStatus !== "FIXTURE_ONLY" || p.sourceType !== "fixture") reasons.push("INVALID_PROVENANCE");
    if (now >= Date.parse(e.freshUntil)) reasons.push("EVIDENCE_EXPIRED");
    if (now < Date.parse(e.observedAt)) reasons.push("EVIDENCE_FROM_FUTURE");
  }
  reasons.push(...verifyMaterialFacts(m, now));
  try {
    const origin = verifyProposalOrigin(trusted.request.text, {kind: "swap_exact_in", amountIn: m.intent.amountIn, maxSlippageBps: m.intent.maxSlippageBps});
    if (!origin.ok) reasons.push("REQUEST_ORIGIN_MISMATCH", ...origin.issues.map(i => i.code));
  } catch { reasons.push("REQUEST_ORIGIN_INVALID"); }
  try {
    const risk = evaluateRisk({assessmentId: m.riskAssessment.assessmentId, requestId: m.request.requestId,
      intentId: m.intent.intentId, facts: m.riskFacts, config: m.riskConfig, evaluatedAt: m.riskAssessment.assessedAt});
    if (hashCanonical(risk) !== hashCanonical(m.riskAssessment)) reasons.push("RISK_RECOMPUTATION_MISMATCH");
    const policy = evaluatePolicy({decisionId: m.policyEvaluation.decision.decisionId, requestId: m.request.requestId,
      intent: m.intent, riskAssessment: risk, facts: m.policyFacts, policy: m.policy, decidedAt: m.policyEvaluation.decision.decidedAt});
    if (hashCanonical(policy) !== hashCanonical(m.policyEvaluation)) reasons.push("POLICY_RECOMPUTATION_MISMATCH");
  } catch { reasons.push("DECISION_RECOMPUTATION_FAILED"); }
  if (m.policyEvaluation.decision.decision === "deny") reasons.push("POLICY_DENIED");
  if (m.policyEvaluation.decision.decision === "require_approval" || o.autonomyState === "APPROVAL_REQUIRED") reasons.push("APPROVAL_REQUIRED");
  if (m.plan === null || m.envelope === null) reasons.push("MISSING_VALIDATED_PLAN");
  else {
    const guard = validateKuruPlan({plan: m.plan, intent: m.intent, quote: m.quote, simulations: m.simulations,
      expectedWalletAddress: trusted.policyFacts.recipient as `0x${string}`, expectedPolicyHash: trusted.policy.configHash as `0x${string}`, now: o.now});
    if (!guard.ok) reasons.push(...guard.reasons);
    // Local envelope integrity only; MATCHED here is not a claim about Privy.
    // Actual provider status is independently checked below, and no execution is possible.
    const envelope = validateExecutionEnvelope({envelope: m.envelope, plan: m.plan, expectedIntentHash: hashCanonical(m.intent),
      expectedRiskConfigHash: hashCanonical(m.riskConfig), expectedWalletPolicyHash: trusted.walletPolicyHash,
      walletPolicyStatus: "MATCHED", now: o.now});
    if (!envelope.ok) reasons.push(...envelope.reasons);
  }
  if (["OBSERVE_ONLY", "PAUSED", "EMERGENCY_STOP"].includes(o.autonomyState)) reasons.push("AUTONOMY_STATE_BLOCKED");
  if (o.nonceStatus === "CONSUMED") reasons.push("NONCE_REPLAYED");
  if (o.nonceStatus === "UNAVAILABLE") reasons.push("NONCE_STORE_UNAVAILABLE");
  if (o.walletPolicyStatus === "DRIFTED") reasons.push("WALLET_POLICY_DRIFTED");
  if (o.walletPolicyStatus === "UNAVAILABLE") reasons.push("WALLET_POLICY_UNAVAILABLE");
  if (o.budgetStatus === "UNAVAILABLE") reasons.push("BUDGET_UNAVAILABLE");
  if (o.mode === "execution") {
    reasons.push("UNATTESTED_CAPSULE", "EXECUTION_NOT_IMPLEMENTED");
    if (o.autonomyState !== "RESTRICTED_EXECUTION") reasons.push("EXECUTION_STATE_BLOCKED");
    if (o.walletPolicyStatus !== "MATCHED") reasons.push("WALLET_POLICY_NOT_MATCHED");
    if (o.budgetStatus !== "RESERVED") reasons.push("BUDGET_NOT_RESERVED");
  }
  return {ok: reasons.length === 0, reasonCodes: [...new Set(reasons)], executionAuthorized: false};
}
