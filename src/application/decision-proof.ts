import type { AgentIntent, RiskAssessment, TransactionPlan, UserRequest } from "../domain/schemas";
import type { PolicyEvaluation } from "../domain/evaluation";
import type { SimulationResult } from "../domain/planning";
import type { DemoEvidenceBundle, DemoOrchestratorDependencies } from "./demo-orchestrator";
import { createDecisionCapsule, type DecisionCandidate, type DecisionMaterial } from "../domain/decision-capsule";
import { createExecutionEnvelope } from "../domain/execution-envelope";
import { hashCanonical } from "../domain/hash";
import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";
import { verifyPreExecution, type ProofVerification, type VerificationOptions } from "./pre-execution-verifier";

export interface DecisionProof {
  candidate: DecisionCandidate;
  trusted: DecisionMaterial;
  options: VerificationOptions;
  verification: ProofVerification;
}

export function createOfflineDecisionProof(input: {
  request: UserRequest; intent: AgentIntent; bundle: DemoEvidenceBundle;
  riskAssessment: RiskAssessment; policyEvaluation: PolicyEvaluation;
  plan: TransactionPlan | null; simulations: SimulationResult[];
  dependencies: DemoOrchestratorDependencies;
}): DecisionProof {
  const {request, intent, bundle, riskAssessment, policyEvaluation, plan, simulations, dependencies: d} = input;
  const walletPolicyHash = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG).walletPolicyHash;
  const material: DecisionMaterial = {
    mode: "offline-fixture", request, intent, ...bundle,
    provenance: bundle.evidence.map(e => ({evidenceId: e.evidenceId, sourceType: "fixture", sourceId: d.evidenceProvider.id,
      observedAt: e.observedAt, blockNumber: e.blockNumber, trustClass: "OFFLINE_FIXTURE", contentHash: e.valueHash,
      expiresAt: e.freshUntil, validationStatus: "FIXTURE_ONLY"})),
    riskConfig: d.riskConfig, policy: d.policy, riskAssessment, policyEvaluation, plan, simulations,
    envelope: plan ? createExecutionEnvelope({plan, intentHash: hashCanonical(intent), riskConfigHash: hashCanonical(d.riskConfig),
      walletPolicyHash, executionNonce: d.idGenerator.next(), expiresAt: plan.quoteExpiresAt}) : null,
    approval: null, walletPolicyHash,
  };
  // Capture the server-owned decision before giving any candidate to a consumer.
  // There is intentionally no API taking caller-supplied trusted material.
  const trusted = structuredClone(material);
  const candidate = {capsule: createDecisionCapsule(material), material: structuredClone(material)};
  const options: VerificationOptions = {now: d.clock.now(), mode: "proposal", autonomyState: "PROPOSE_ONLY",
    nonceStatus: "UNUSED", walletPolicyStatus: "NOT_CONFIGURED", budgetStatus: "NOT_RESERVED"};
  return {candidate, trusted, options, verification: verifyPreExecution({candidate, trusted, options})};
}
