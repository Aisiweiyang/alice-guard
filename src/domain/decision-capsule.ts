import { z } from "zod";
import { AgentIntentSchema, ApprovalRequestSchema, Bytes32Schema, EvidenceItemSchema, PolicySchema, RiskAssessmentSchema, TransactionPlanSchema, UserRequestSchema } from "./schemas";
import { PolicyEvaluationSchema, PolicyFactsSchema, RiskConfigSchema, RiskFactsSchema } from "./evaluation";
import { KuruQuoteSchema, SimulationResultSchema } from "./planning";
import { ExecutionEnvelopeSchema } from "./execution-envelope";
import { hashCanonical } from "./hash";
import { DecisionCapsuleSchema, ProvenanceSchema, type DecisionCapsule } from "./decision-capsule-shape";
import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";

export { DecisionCapsuleSchema, ProvenanceSchema, type DecisionCapsule } from "./decision-capsule-shape";
export const DecisionMaterialSchema = z.object({
  mode: z.literal("offline-fixture"),
  request: UserRequestSchema, intent: AgentIntentSchema,
  evidence: z.array(EvidenceItemSchema).min(1).max(128),
  provenance: z.array(ProvenanceSchema).min(1).max(128),
  riskFacts: RiskFactsSchema, policyFacts: PolicyFactsSchema,
  riskConfig: RiskConfigSchema, policy: PolicySchema,
  riskAssessment: RiskAssessmentSchema, policyEvaluation: PolicyEvaluationSchema,
  quote: KuruQuoteSchema, simulations: z.array(SimulationResultSchema).max(2),
  plan: TransactionPlanSchema.nullable(), envelope: ExecutionEnvelopeSchema.nullable(),
  approval: ApprovalRequestSchema.nullable(), walletPolicyHash: Bytes32Schema,
}).strict();
export type DecisionMaterial = z.infer<typeof DecisionMaterialSchema>;
export const DecisionCandidateSchema = z.object({capsule: DecisionCapsuleSchema, material: DecisionMaterialSchema}).strict();
export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;

export function computeDecisionCapsuleHash(capsule: DecisionCapsule): `0x${string}` {
  const { capsuleHash: _hash, ...body } = capsule;
  return hashCanonical(body);
}

/** An integrity commitment, NOT a signature, authorization token, or safety proof. */
export function createDecisionCapsule(input: DecisionMaterial): DecisionCapsule {
  const m = DecisionMaterialSchema.parse(input);
  const decision = m.policyEvaluation.decision;
  const expiry = Math.min(Date.parse(m.quote.expiresAt), ...m.evidence.map(e => Date.parse(e.freshUntil)),
    ...m.provenance.map(p => Date.parse(p.expiresAt)),
    m.envelope ? Date.parse(m.envelope.expiresAt) : Infinity,
    m.approval ? Date.parse(m.approval.expiresAt) : Infinity);
  const capsule = DecisionCapsuleSchema.parse({
    schemaVersion: "alice-guard.capsule.v1", recordId: decision.decisionId, requestId: m.request.requestId,
    requestHash: hashCanonical(m.request), intentHash: hashCanonical(m.intent), evidenceHash: m.quote.evidenceHash,
    evidenceRoot: hashCanonical({evidence: m.evidence, provenance: m.provenance, riskFacts: m.riskFacts, policyFacts: m.policyFacts, quote: m.quote}),
    riskConfigHash: hashCanonical(m.riskConfig), applicationPolicyHash: m.policy.configHash,
    policyDefinitionHash: hashCanonical(m.policy), walletPolicyHash: m.walletPolicyHash,
    planHash: m.plan?.planHash ?? null, simulationHash: hashCanonical(m.simulations),
    approvalHash: m.approval ? hashCanonical(m.approval) : null, envelopeHash: m.envelope?.envelopeHash ?? null,
    materialHash: hashCanonical(m), chainId: m.intent.chainId,
    walletAddress: m.plan?.walletAddress ?? m.policyFacts.recipient,
    quoteBlockNumber: m.quote.blockNumber, quoteExpiresAt: m.quote.expiresAt,
    decisionCreatedAt: decision.decidedAt, decisionExpiresAt: new Date(expiry).toISOString(),
    executionNonce: m.envelope?.executionNonce ?? null,
    verdict: decision.decision === "allow" ? "ALLOW" : decision.decision === "deny" ? "DENY" : "REQUIRE_APPROVAL",
    firedRuleIds: m.policyEvaluation.trace.filter(t => t.outcome !== "skipped").map(t => t.ruleId).sort(),
    safeReasonCodes: [...new Set(decision.reasons.map(r => r.code))].sort(),
    // This is compiler capability coverage; it does not assert a remote binding.
    enforcementCoverage: compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG).coverage.map(({rule, enforcement}) => ({rule, enforcement})),
    attestation: {status: "UNATTESTED"}, capsuleHash: `0x${"00".repeat(32)}`,
  });
  return DecisionCapsuleSchema.parse({...capsule, capsuleHash: computeDecisionCapsuleHash(capsule)});
}
