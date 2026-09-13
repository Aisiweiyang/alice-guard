import type { Address } from "viem";

import { buildKuruExactInputPlan } from "./build-plan";
import { validateKuruPlan } from "./plan-guard";
import { parseUserRequest } from "./parse-request";
import type { AuditStore } from "./audit-store";
import type { Clock, IdGenerator, LLMProvider } from "./ports";
import { evaluatePolicy } from "../engines/policy-engine";
import { evaluateRisk } from "../engines/risk-engine";
import { hashCanonical } from "../domain/hash";
import type { KuruQuote, SimulationResult } from "../domain/planning";
import type { PolicyEvaluation, PolicyFacts, RiskConfig, RiskFacts } from "../domain/evaluation";
import {
  AuditEventSchema,
  type AgentIntent,
  type AuditEvent,
  type AuditRecord,
  type EvidenceItem,
  type Policy,
  type RiskAssessment,
  type TransactionPlan,
  type UserRequest,
} from "../domain/schemas";

export interface DemoEvidenceBundle {
  evidence: EvidenceItem[];
  riskFacts: RiskFacts;
  policyFacts: PolicyFacts;
  quote: KuruQuote;
}

export interface DemoEvidenceProvider {
  readonly id: string;
  collect(intent: AgentIntent): Promise<DemoEvidenceBundle>;
}

export interface DemoPlanSimulator {
  readonly id: string;
  simulate(plan: TransactionPlan): Promise<SimulationResult[]>;
}

export interface DemoOrchestratorDependencies {
  llmProvider: LLMProvider;
  evidenceProvider: DemoEvidenceProvider;
  simulator: DemoPlanSimulator;
  auditStore: AuditStore;
  clock: Clock;
  idGenerator: IdGenerator;
  policy: Policy;
  riskConfig: RiskConfig;
  walletAddress: Address;
}

export type DemoRunResult = {
  status: "prepared" | "requires_approval" | "denied";
  stage: "intent" | "risk" | "policy" | "plan";
  reasonCodes: string[];
  riskAssessment: RiskAssessment | null;
  policyEvaluation: PolicyEvaluation | null;
  plan: TransactionPlan | null;
  audit: AuditRecord;
};

function auditEvent(
  dependencies: DemoOrchestratorDependencies,
  type: string,
  actor: AuditEvent["actor"],
  payload: unknown,
  safeSummary: string,
): AuditEvent {
  return AuditEventSchema.parse({
    eventId: dependencies.idGenerator.next(),
    type,
    actor,
    occurredAt: dependencies.clock.now(),
    payloadHash: hashCanonical(payload),
    safeSummary,
  });
}

function appendAudit(
  dependencies: DemoOrchestratorDependencies,
  request: UserRequest,
  values: {
    intent: AgentIntent | null;
    intentIssues: Array<{ path: string; code: string; message: string }>;
    evidence?: EvidenceItem[];
    risk?: RiskAssessment | null;
    policy?: PolicyEvaluation | null;
    plan?: TransactionPlan | null;
    events: AuditEvent[];
  },
): AuditRecord {
  const now = dependencies.clock.now();
  return dependencies.auditStore.append({
    auditId: dependencies.idGenerator.next(),
    request,
    intentValidation: { success: values.intent !== null, issues: values.intentIssues },
    parsedIntent: values.intent,
    evidence: values.evidence ?? [],
    riskAssessment: values.risk ?? null,
    policyDecision: values.policy?.decision ?? null,
    transactionPlan: values.plan ?? null,
    approval: null,
    execution: null,
    events: values.events,
    createdAt: now,
    updatedAt: now,
  });
}

export async function runDemoRequest(
  request: UserRequest,
  dependencies: DemoOrchestratorDependencies,
): Promise<DemoRunResult> {
  const events: AuditEvent[] = [
    auditEvent(dependencies, "request.received", "user", { requestId: request.requestId }, "Request received"),
  ];
  const parseResult = await parseUserRequest(request, {
    provider: dependencies.llmProvider,
    clock: dependencies.clock,
    idGenerator: dependencies.idGenerator,
    defaultMaxSlippageBps: 100,
  });

  if (parseResult.status === "rejected") {
    events.push(
      auditEvent(
        dependencies,
        "intent.rejected",
        "system",
        { rejectionCode: parseResult.rejectionCode, issues: parseResult.issues },
        `Intent rejected: ${parseResult.rejectionCode}`,
      ),
    );
    const audit = appendAudit(dependencies, request, {
      intent: null,
      intentIssues: parseResult.issues,
      events,
    });
    return {
      status: "denied",
      stage: "intent",
      reasonCodes: [parseResult.rejectionCode, ...parseResult.issues.map((issue) => issue.code)],
      riskAssessment: null,
      policyEvaluation: null,
      plan: null,
      audit,
    };
  }

  const intent = parseResult.intent;
  events.push(auditEvent(dependencies, "intent.accepted", "llm", intent, "Structured intent accepted"));

  let bundle: DemoEvidenceBundle;
  try {
    bundle = await dependencies.evidenceProvider.collect(intent);
  } catch {
    events.push(
      auditEvent(dependencies, "evidence.rejected", "system", { providerId: dependencies.evidenceProvider.id }, "Evidence collection failed closed"),
    );
    const audit = appendAudit(dependencies, request, { intent, intentIssues: [], events });
    return {
      status: "denied",
      stage: "risk",
      reasonCodes: ["EVIDENCE_PROVIDER_FAILURE"],
      riskAssessment: null,
      policyEvaluation: null,
      plan: null,
      audit,
    };
  }

  const riskAssessment = evaluateRisk({
    assessmentId: dependencies.idGenerator.next(),
    requestId: request.requestId,
    intentId: intent.intentId,
    facts: bundle.riskFacts,
    config: dependencies.riskConfig,
    evaluatedAt: dependencies.clock.now(),
  });
  events.push(auditEvent(dependencies, "risk.evaluated", "policy-engine", riskAssessment, `Risk evaluated: ${riskAssessment.level}`));

  const policyEvaluation = evaluatePolicy({
    decisionId: dependencies.idGenerator.next(),
    requestId: request.requestId,
    intent,
    riskAssessment,
    facts: bundle.policyFacts,
    policy: dependencies.policy,
    decidedAt: dependencies.clock.now(),
  });
  events.push(auditEvent(dependencies, "policy.decided", "policy-engine", policyEvaluation, `Policy decision: ${policyEvaluation.decision.decision}`));

  if (policyEvaluation.decision.decision === "deny") {
    const reasonCodes = policyEvaluation.decision.reasons.map((reason) => reason.code);
    const audit = appendAudit(dependencies, request, {
      intent,
      intentIssues: [],
      evidence: bundle.evidence,
      risk: riskAssessment,
      policy: policyEvaluation,
      events,
    });
    return {
      status: "denied",
      stage: "policy",
      reasonCodes,
      riskAssessment,
      policyEvaluation,
      plan: null,
      audit,
    };
  }

  let plan: TransactionPlan | null = null;
  let planFailureReasons: string[] = [];
  try {
    const draft = buildKuruExactInputPlan(
      {
        intent,
        quote: bundle.quote,
        walletAddress: dependencies.walletAddress,
        policyHash: dependencies.policy.configHash as `0x${string}`,
        evidenceHash: bundle.quote.evidenceHash as `0x${string}`,
        gasLimits: { approve: 80_000n, swap: 500_000n },
      },
      { nextId: () => dependencies.idGenerator.next(), now: () => dependencies.clock.now() },
    );
    const simulations = await dependencies.simulator.simulate(draft);
    const guarded = validateKuruPlan({
      plan: draft,
      intent,
      quote: bundle.quote,
      simulations,
      expectedWalletAddress: dependencies.walletAddress,
      expectedPolicyHash: dependencies.policy.configHash as `0x${string}`,
      now: dependencies.clock.now(),
    });
    if (guarded.ok) plan = guarded.plan;
    else planFailureReasons = guarded.reasons;
  } catch {
    planFailureReasons = ["PLAN_BUILD_OR_SIMULATION_FAILED"];
  }

  if (plan === null) {
    events.push(auditEvent(dependencies, "plan.rejected", "plan-guard", planFailureReasons, "Transaction plan rejected"));
    const audit = appendAudit(dependencies, request, {
      intent,
      intentIssues: [],
      evidence: bundle.evidence,
      risk: riskAssessment,
      policy: policyEvaluation,
      events,
    });
    return {
      status: "denied",
      stage: "plan",
      reasonCodes: planFailureReasons,
      riskAssessment,
      policyEvaluation,
      plan: null,
      audit,
    };
  }

  events.push(auditEvent(dependencies, "plan.validated", "plan-guard", { planHash: plan.planHash }, "Transaction plan validated; no signing performed"));
  const status = policyEvaluation.decision.decision === "require_approval" ? "requires_approval" : "prepared";
  const audit = appendAudit(dependencies, request, {
    intent,
    intentIssues: [],
    evidence: bundle.evidence,
    risk: riskAssessment,
    policy: policyEvaluation,
    plan,
    events,
  });
  return {
    status,
    stage: "plan",
    reasonCodes: policyEvaluation.decision.reasons.map((reason) => reason.code),
    riskAssessment,
    policyEvaluation,
    plan,
    audit,
  };
}
