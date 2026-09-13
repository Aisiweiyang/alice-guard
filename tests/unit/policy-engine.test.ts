import { describe, expect, it } from "vitest";

import { PolicyReasonCode } from "../../src/domain/reason-codes";
import { evaluatePolicy } from "../../src/engines/policy-engine";
import { lowRiskAssessment, makePolicyRequest } from "../fixtures/evaluation-fixtures";

function codes(result: ReturnType<typeof evaluatePolicy>): string[] {
  return result.decision.reasons.map((reason) => reason.code);
}

describe("default-deny policy engine", () => {
  it.each([
    ["49.999999", "allow"],
    ["50", "require_approval"],
    ["100", "require_approval"],
    ["100.000001", "deny"],
    ["101", "deny"],
  ] as const)("evaluates transaction boundary %s as %s", (transactionUsd, expected) => {
    expect(evaluatePolicy(makePolicyRequest({ transactionUsd })).decision.decision).toBe(expected);
  });

  it("lets a deny override approval-required", () => {
    const result = evaluatePolicy(makePolicyRequest({ transactionUsd: "5000" }));
    expect(result.decision.decision).toBe("deny");
    expect(codes(result)).toContain(PolicyReasonCode.TransactionLimitExceeded);
    expect(codes(result)).toContain(PolicyReasonCode.ApprovalRequired);
  });

  it("denies an unknown token", () => {
    const result = evaluatePolicy(makePolicyRequest({ assetOutId: "monad-testnet:UNKNOWN" }));
    expect(result.decision.decision).toBe("deny");
    expect(codes(result)).toContain(PolicyReasonCode.TokenNotAllowed);
  });

  it("denies an unknown contract", () => {
    const result = evaluatePolicy(makePolicyRequest({ contractId: "unknown.router" }));
    expect(codes(result)).toContain(PolicyReasonCode.ContractNotAllowed);
  });

  it("denies a chain not enabled by the testnet policy", () => {
    const request = makePolicyRequest();
    request.intent = { ...request.intent, network: "monad-mainnet", chainId: 143 };
    expect(codes(evaluatePolicy(request))).toContain(PolicyReasonCode.UnknownChain);
  });

  it("denies an unknown recipient", () => {
    const result = evaluatePolicy(makePolicyRequest({ recipient: `0x${"99".repeat(20)}` }));
    expect(codes(result)).toContain(PolicyReasonCode.RecipientNotAllowed);
  });

  it("denies stale or missing price evidence", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ evidenceAgeSeconds: { price: 121 } })))).toContain(PolicyReasonCode.EvidenceStale);
    expect(codes(evaluatePolicy(makePolicyRequest({ evidenceAgeSeconds: { price: null } })))).toContain(PolicyReasonCode.EvidenceMissing);
  });

  it("independently enforces quote freshness", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ evidenceAgeSeconds: { quote: 21 } })))).toContain(PolicyReasonCode.EvidenceStale);
  });

  it("denies excessive slippage", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ slippageBps: 101 })))).toContain(PolicyReasonCode.SlippageExceeded);
  });

  it("denies an insufficient native reserve", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ nativeBalanceRaw: "100", estimatedGasCostRaw: "91" })))).toContain(PolicyReasonCode.NativeReserveInsufficient);
  });

  it("denies unknown calldata", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ calldataKnown: false })))).toContain(PolicyReasonCode.UnknownCalldata);
  });

  it("denies excessive post-trade allocation", () => {
    expect(codes(evaluatePolicy(makePolicyRequest({ postTradeAllocationBps: 501 })))).toContain(PolicyReasonCode.AllocationExceeded);
  });

  it("denies a high risk assessment even when every allowlist matches", () => {
    const result = evaluatePolicy(makePolicyRequest({}, { ...lowRiskAssessment, score: 70, level: "high", recommendedAction: "deny" }));
    expect(codes(result)).toContain(PolicyReasonCode.RiskLevelDenied);
  });

  it("includes reservations when enforcing the rolling cap", () => {
    expect(evaluatePolicy(makePolicyRequest({ transactionUsd: "39.999999", rollingSpentUsd: "150", rollingReservedUsd: "10" })).decision.decision).toBe("allow");
    expect(codes(evaluatePolicy(makePolicyRequest({ transactionUsd: "40.000001", rollingSpentUsd: "150", rollingReservedUsd: "10" })))).toContain(PolicyReasonCode.RollingSpendExceeded);
  });

  it("denies an incomplete policy rather than silently allowing", () => {
    const request = makePolicyRequest();
    request.policy.rules = request.policy.rules.filter((rule) => rule.type !== "known_calldata_only");
    const result = evaluatePolicy(request);
    expect(result.decision.decision).toBe("deny");
    expect(codes(result)).toContain(PolicyReasonCode.CoverageIncomplete);
  });

  it("requires both price and quote freshness rules", () => {
    const request = makePolicyRequest();
    request.policy.rules = request.policy.rules.filter((rule) => rule.type !== "max_data_age_seconds" || rule.evidenceKind !== "quote");
    expect(codes(evaluatePolicy(request))).toContain(PolicyReasonCode.CoverageIncomplete);
  });

  it("returns an explicit denial when every rule is disabled", () => {
    const request = makePolicyRequest();
    request.policy.rules = request.policy.rules.map((rule) => ({ ...rule, enabled: false }));
    const result = evaluatePolicy(request);
    expect(result.decision.decision).toBe("deny");
    expect(result.decision.evaluatedRuleIds).toEqual(["policy-coverage"]);
  });

  it("is deterministic and emits a trace for every configured rule", () => {
    const request = makePolicyRequest();
    const first = evaluatePolicy(request);
    const second = evaluatePolicy(structuredClone(request));
    expect(first).toEqual(second);
    expect(first.trace).toHaveLength(request.policy.rules.length);
  });

  it("rejects cross-request risk assessment reuse at the schema boundary", () => {
    const request = makePolicyRequest();
    request.riskAssessment = { ...request.riskAssessment, requestId: "00000000-0000-4000-8000-000000000099" };
    expect(() => evaluatePolicy(request)).toThrow();
  });
});
