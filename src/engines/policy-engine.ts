import { addUnsignedDecimals, compareUnsignedDecimals, remainingAfterSpend } from "../domain/canonicalize";
import {
  PolicyEvaluationRequestSchema,
  PolicyEvaluationSchema,
  type EvidenceKind,
  type PolicyEvaluation,
  type PolicyEvaluationRequest,
  type PolicyRuleTrace,
} from "../domain/evaluation";
import { PolicyReasonCode } from "../domain/reason-codes";
import type { PolicyReason, PolicyRule } from "../domain/schemas";

const REQUIRED_RULE_TYPES = new Set<PolicyRule["type"]>([
  "allowed_chain_ids",
  "allowed_actions",
  "token_allowlist",
  "contract_allowlist",
  "recipient_allowlist",
  "max_transaction_usd",
  "rolling_spend_usd",
  "human_approval_threshold_usd",
  "max_slippage_bps",
  "min_native_reserve",
  "max_portfolio_allocation_bps",
  "max_data_age_seconds",
  "deny_risk_levels",
  "known_calldata_only",
]);

interface RuleResult {
  trace: PolicyRuleTrace;
  reason: PolicyReason | null;
}

function reason(code: string, ruleId: string | null, message: string): PolicyReason {
  return { code, ruleId, message, evidenceIds: [] };
}

function result(rule: PolicyRule, outcome: PolicyRuleTrace["outcome"], reasonCode: string, message?: string): RuleResult {
  return {
    trace: { ruleId: rule.ruleId, ruleType: rule.type, outcome, reasonCode },
    reason: outcome === "pass" || outcome === "skipped" ? null : reason(reasonCode, rule.ruleId, message ?? reasonCode),
  };
}

function evidenceAge(request: PolicyEvaluationRequest, kind: EvidenceKind): number | null {
  return request.facts.evidenceAgeSeconds[kind];
}

function evaluateRule(rule: PolicyRule, request: PolicyEvaluationRequest): RuleResult {
  if (!rule.enabled) return result(rule, "skipped", "RULE_DISABLED");
  const { facts, intent, riskAssessment } = request;

  switch (rule.type) {
    case "allowed_chain_ids":
      return rule.chainIds.includes(intent.chainId) ? result(rule, "pass", "CHAIN_ALLOWED") : result(rule, "deny", PolicyReasonCode.UnknownChain, `chain ${intent.chainId} is not allowed`);
    case "allowed_actions":
      return rule.actions.includes(intent.action) ? result(rule, "pass", "ACTION_ALLOWED") : result(rule, "deny", PolicyReasonCode.UnsupportedAction, `action ${intent.action} is not allowed`);
    case "token_allowlist":
      return rule.assetIds.includes(facts.assetInId) && rule.assetIds.includes(facts.assetOutId)
        ? result(rule, "pass", "TOKENS_ALLOWED")
        : result(rule, "deny", PolicyReasonCode.TokenNotAllowed, "input or output token is not allowlisted");
    case "contract_allowlist":
      return rule.contractIds.includes(facts.contractId) ? result(rule, "pass", "CONTRACT_ALLOWED") : result(rule, "deny", PolicyReasonCode.ContractNotAllowed, "contract is not allowlisted");
    case "recipient_allowlist":
      return rule.recipients.some((recipient) => recipient.toLowerCase() === facts.recipient.toLowerCase())
        ? result(rule, "pass", "RECIPIENT_ALLOWED")
        : result(rule, "deny", PolicyReasonCode.RecipientNotAllowed, "recipient is not allowlisted");
    case "max_transaction_usd":
      return compareUnsignedDecimals(facts.transactionUsd, rule.maxUsd) <= 0
        ? result(rule, "pass", "TRANSACTION_LIMIT_OK")
        : result(rule, "deny", PolicyReasonCode.TransactionLimitExceeded, `transaction exceeds ${rule.maxUsd} USD`);
    case "rolling_spend_usd": {
      const projected = addUnsignedDecimals(facts.rollingSpentUsd, facts.rollingReservedUsd, facts.transactionUsd);
      return compareUnsignedDecimals(projected, rule.maxUsd) <= 0
        ? result(rule, "pass", "ROLLING_LIMIT_OK")
        : result(rule, "deny", PolicyReasonCode.RollingSpendExceeded, `projected rolling spend exceeds ${rule.maxUsd} USD`);
    }
    case "human_approval_threshold_usd":
      return compareUnsignedDecimals(facts.transactionUsd, rule.thresholdUsd) >= 0
        ? result(rule, "require_approval", PolicyReasonCode.ApprovalRequired, `transaction is at or above ${rule.thresholdUsd} USD`)
        : result(rule, "pass", "APPROVAL_NOT_REQUIRED");
    case "max_slippage_bps":
      return facts.slippageBps <= rule.maxBps
        ? result(rule, "pass", "SLIPPAGE_LIMIT_OK")
        : result(rule, "deny", PolicyReasonCode.SlippageExceeded, `slippage ${facts.slippageBps} bps exceeds ${rule.maxBps} bps`);
    case "min_native_reserve": {
      const remaining = remainingAfterSpend(facts.nativeBalanceRaw, facts.estimatedGasCostRaw);
      return remaining !== null && remaining >= BigInt(rule.minRaw)
        ? result(rule, "pass", "NATIVE_RESERVE_OK")
        : result(rule, "deny", PolicyReasonCode.NativeReserveInsufficient, "estimated gas violates minimum native reserve");
    }
    case "max_portfolio_allocation_bps":
      return facts.postTradeAllocationBps <= rule.maxBps
        ? result(rule, "pass", "ALLOCATION_LIMIT_OK")
        : result(rule, "deny", PolicyReasonCode.AllocationExceeded, `post-trade allocation exceeds ${rule.maxBps} bps`);
    case "max_data_age_seconds": {
      const age = evidenceAge(request, rule.evidenceKind);
      if (age === null) return result(rule, "deny", PolicyReasonCode.EvidenceMissing, `${rule.evidenceKind} evidence is missing`);
      return age <= rule.maxAgeSeconds
        ? result(rule, "pass", "EVIDENCE_FRESH")
        : result(rule, "deny", PolicyReasonCode.EvidenceStale, `${rule.evidenceKind} evidence age ${age}s exceeds ${rule.maxAgeSeconds}s`);
    }
    case "deny_risk_levels":
      return rule.levels.includes(riskAssessment.level)
        ? result(rule, "deny", PolicyReasonCode.RiskLevelDenied, `risk level ${riskAssessment.level} is denied`)
        : result(rule, "pass", "RISK_LEVEL_ALLOWED");
    case "known_calldata_only":
      return facts.calldataKnown ? result(rule, "pass", "CALLDATA_KNOWN") : result(rule, "deny", PolicyReasonCode.UnknownCalldata, "calldata is unknown or undecodable");
  }
}

export function evaluatePolicy(rawRequest: PolicyEvaluationRequest): PolicyEvaluation {
  const request = PolicyEvaluationRequestSchema.parse(rawRequest);
  const activeTypes = new Set(request.policy.rules.filter((rule) => rule.enabled).map((rule) => rule.type));
  const missingCoverage: string[] = [...REQUIRED_RULE_TYPES].filter((type) => !activeTypes.has(type));
  const freshnessKinds = new Set(
    request.policy.rules
      .filter(
        (rule): rule is Extract<PolicyRule, { type: "max_data_age_seconds" }> =>
          rule.enabled && rule.type === "max_data_age_seconds",
      )
      .map((rule) => rule.evidenceKind),
  );
  for (const requiredKind of ["price", "quote"] as const) {
    if (!freshnessKinds.has(requiredKind)) missingCoverage.push(`max_data_age_seconds:${requiredKind}`);
  }
  const evaluated = request.policy.rules.map((rule) => evaluateRule(rule, request));
  const trace = evaluated.map(({ trace: item }) => item);
  const ruleReasons = evaluated.flatMap(({ reason: item }) => (item === null ? [] : [item]));

  if (missingCoverage.length > 0) {
    ruleReasons.unshift(reason(PolicyReasonCode.CoverageIncomplete, null, `required policy coverage missing: ${missingCoverage.join(", ")}`));
  }

  const hasDeny = missingCoverage.length > 0 || trace.some((item) => item.outcome === "deny");
  const requiresApproval = trace.some((item) => item.outcome === "require_approval");
  const decision = hasDeny ? "deny" : requiresApproval ? "require_approval" : "allow";
  const reasons = ruleReasons.length > 0
    ? ruleReasons
    : [reason(PolicyReasonCode.AllRulesPassed, null, "all required policy rules passed")];

  return PolicyEvaluationSchema.parse({
    decision: {
      decisionId: request.decisionId,
      requestId: request.requestId,
      intentId: request.intent.intentId,
      decision,
      reasons,
      evaluatedRuleIds: (() => {
        const activeRuleIds = request.policy.rules.filter((rule) => rule.enabled).map((rule) => rule.ruleId);
        return activeRuleIds.length === 0 ? ["policy-coverage"] : activeRuleIds;
      })(),
      policyId: request.policy.policyId,
      policyVersion: request.policy.version,
      policyHash: request.policy.configHash,
      decidedAt: request.decidedAt,
    },
    trace,
  });
}
