import { describe, expect, it } from "vitest";

import { RiskReasonCode } from "../../src/domain/reason-codes";
import { evaluateRisk } from "../../src/engines/risk-engine";
import { makeRiskRequest } from "../fixtures/evaluation-fixtures";

function reasonCodes(result: ReturnType<typeof evaluateRisk>): string[] {
  return result.reasons.map((reason) => reason.code);
}

describe("deterministic risk engine", () => {
  it("returns low risk for fresh, funded, low-impact facts", () => {
    const result = evaluateRisk(makeRiskRequest());
    expect(result).toMatchObject({ score: 0, level: "low", recommendedAction: "continue" });
    expect(reasonCodes(result)).toContain(RiskReasonCode.WithinLimits);
  });

  it("fails closed when price is missing", () => {
    const result = evaluateRisk(makeRiskRequest({ priceObservedAt: null, evidenceIds: { price: null } }));
    expect(result).toMatchObject({ level: "critical", recommendedAction: "deny" });
    expect(reasonCodes(result)).toContain(RiskReasonCode.MissingPrice);
  });

  it("fails closed when price is stale", () => {
    const result = evaluateRisk(makeRiskRequest({ priceObservedAt: "2026-09-12T23:57:59.000Z" }));
    expect(result.level).toBe("critical");
    expect(reasonCodes(result)).toContain(RiskReasonCode.StalePrice);
  });

  it("fails closed when quote evidence is missing", () => {
    const result = evaluateRisk(makeRiskRequest({ quoteObservedAt: null, quoteExpiresAt: null, evidenceIds: { quote: null } }));
    expect(result.level).toBe("critical");
    expect(reasonCodes(result)).toContain(RiskReasonCode.MissingQuote);
  });

  it("detects insufficient asset balance", () => {
    const result = evaluateRisk(makeRiskRequest({ amountInRaw: "100000001" }));
    expect(result.level).toBe("critical");
    expect(reasonCodes(result)).toContain(RiskReasonCode.InsufficientBalance);
  });

  it("detects an unsafe gas reserve", () => {
    const result = evaluateRisk(makeRiskRequest({ nativeBalanceRaw: "100", estimatedGasCostRaw: "91", minimumNativeReserveRaw: "10" }));
    expect(reasonCodes(result)).toContain(RiskReasonCode.InsufficientGasReserve);
  });

  it("fails closed when liquidity evidence is missing", () => {
    const result = evaluateRisk(makeRiskRequest({ liquidityUsd: null, evidenceIds: { liquidity: null } }));
    expect(result.level).toBe("critical");
    expect(reasonCodes(result)).toContain(RiskReasonCode.MissingLiquidity);
  });

  it("escalates warning slippage to human review", () => {
    const result = evaluateRisk(makeRiskRequest({ expectedSlippageBps: 75 }));
    expect(result).toMatchObject({ level: "medium", recommendedAction: "require_approval" });
  });

  it("treats a large but policy-bounded amount as reviewable risk", () => {
    const result = evaluateRisk(makeRiskRequest({ transactionUsd: "50" }));
    expect(result).toMatchObject({ level: "medium", recommendedAction: "require_approval" });
    expect(reasonCodes(result)).toContain(RiskReasonCode.LargeTransaction);
  });

  it("denies high contract risk independently of policy allowlists", () => {
    const result = evaluateRisk(makeRiskRequest({ contractRisk: "high" }));
    expect(result).toMatchObject({ level: "high", recommendedAction: "deny" });
    expect(reasonCodes(result)).toContain(RiskReasonCode.ContractRisk);
  });

  it("is deterministic for identical inputs", () => {
    const request = makeRiskRequest();
    expect(evaluateRisk(request)).toEqual(evaluateRisk(structuredClone(request)));
  });
});
