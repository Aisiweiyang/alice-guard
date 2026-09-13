import { compareUnsignedDecimals, remainingAfterSpend } from "../domain/canonicalize";
import type { RiskEvaluationRequest } from "../domain/evaluation";
import { RiskEvaluationRequestSchema } from "../domain/evaluation";
import { RiskReasonCode } from "../domain/reason-codes";
import { RiskAssessmentSchema, type RiskAssessment, type RiskReason } from "../domain/schemas";

type RiskBand = "low" | "medium" | "high" | "critical";

interface Finding {
  score: number;
  code: string;
  severity: RiskReason["severity"];
  message: string;
  evidenceIds: string[];
}

const BAND_SCORE: Readonly<Record<RiskBand, number>> = {
  low: 0,
  medium: 30,
  high: 70,
  critical: 100,
};

function secondsFrom(timestamp: string, evaluatedAtMs: number): number {
  return Math.floor((evaluatedAtMs - Date.parse(timestamp)) / 1_000);
}

function addBandFinding(findings: Finding[], kind: "token" | "contract" | "destination", band: RiskBand, evidenceId: string): void {
  if (band === "low") return;
  const code = kind === "token" ? RiskReasonCode.TokenRisk : kind === "contract" ? RiskReasonCode.ContractRisk : RiskReasonCode.DestinationRisk;
  findings.push({
    score: BAND_SCORE[band],
    code,
    severity: band,
    message: `${kind} risk is ${band}`,
    evidenceIds: [evidenceId],
  });
}

function levelFor(score: number): RiskAssessment["level"] {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 30) return "medium";
  return "low";
}

export function evaluateRisk(rawRequest: RiskEvaluationRequest): RiskAssessment {
  const request = RiskEvaluationRequestSchema.parse(rawRequest);
  const { facts, config } = request;
  const nowMs = Date.parse(request.evaluatedAt);
  const findings: Finding[] = [];

  if (facts.priceObservedAt === null || facts.evidenceIds.price === null) {
    findings.push({ score: 100, code: RiskReasonCode.MissingPrice, severity: "critical", message: "required price evidence is missing", evidenceIds: [] });
  } else {
    const age = secondsFrom(facts.priceObservedAt, nowMs);
    if (age < -config.futureTimestampToleranceSeconds) {
      findings.push({ score: 100, code: RiskReasonCode.FuturePrice, severity: "critical", message: "price timestamp is unexpectedly in the future", evidenceIds: [facts.evidenceIds.price] });
    } else if (age > config.maxPriceAgeSeconds) {
      findings.push({ score: 90, code: RiskReasonCode.StalePrice, severity: "critical", message: `price age ${age}s exceeds ${config.maxPriceAgeSeconds}s`, evidenceIds: [facts.evidenceIds.price] });
    }
  }

  if (facts.quoteObservedAt === null || facts.quoteExpiresAt === null || facts.evidenceIds.quote === null) {
    findings.push({ score: 100, code: RiskReasonCode.MissingQuote, severity: "critical", message: "required quote evidence is missing", evidenceIds: [] });
  } else {
    const age = secondsFrom(facts.quoteObservedAt, nowMs);
    if (age < -config.futureTimestampToleranceSeconds) {
      findings.push({ score: 100, code: RiskReasonCode.FutureQuote, severity: "critical", message: "quote timestamp is unexpectedly in the future", evidenceIds: [facts.evidenceIds.quote] });
    } else if (age > config.maxQuoteAgeSeconds) {
      findings.push({ score: 90, code: RiskReasonCode.StaleQuote, severity: "critical", message: `quote age ${age}s exceeds ${config.maxQuoteAgeSeconds}s`, evidenceIds: [facts.evidenceIds.quote] });
    }
    if (Date.parse(facts.quoteExpiresAt) <= nowMs) {
      findings.push({ score: 100, code: RiskReasonCode.ExpiredQuote, severity: "critical", message: "quote has expired", evidenceIds: [facts.evidenceIds.quote] });
    }
  }

  if (remainingAfterSpend(facts.walletAssetBalanceRaw, facts.amountInRaw) === null) {
    findings.push({ score: 100, code: RiskReasonCode.InsufficientBalance, severity: "critical", message: "input amount exceeds wallet asset balance", evidenceIds: [facts.evidenceIds.balance] });
  }

  const afterGas = remainingAfterSpend(facts.nativeBalanceRaw, facts.estimatedGasCostRaw);
  if (afterGas === null || afterGas < BigInt(facts.minimumNativeReserveRaw)) {
    findings.push({ score: 100, code: RiskReasonCode.InsufficientGasReserve, severity: "critical", message: "estimated gas would violate the minimum native reserve", evidenceIds: [facts.evidenceIds.gas, facts.evidenceIds.balance] });
  }

  if (facts.liquidityUsd === null || facts.evidenceIds.liquidity === null) {
    findings.push({ score: 100, code: RiskReasonCode.MissingLiquidity, severity: "critical", message: "liquidity evidence is missing", evidenceIds: [] });
  } else if (compareUnsignedDecimals(facts.liquidityUsd, config.minimumLiquidityUsd) < 0) {
    findings.push({ score: 70, code: RiskReasonCode.LowLiquidity, severity: "high", message: "observed liquidity is below the configured minimum", evidenceIds: [facts.evidenceIds.liquidity] });
  }

  if (facts.volatilityBps >= config.criticalVolatilityBps) {
    findings.push({ score: 70, code: RiskReasonCode.HighVolatility, severity: "high", message: "volatility reached the critical threshold", evidenceIds: facts.evidenceIds.price === null ? [] : [facts.evidenceIds.price] });
  } else if (facts.volatilityBps >= config.warningVolatilityBps) {
    findings.push({ score: 30, code: RiskReasonCode.HighVolatility, severity: "medium", message: "volatility reached the warning threshold", evidenceIds: facts.evidenceIds.price === null ? [] : [facts.evidenceIds.price] });
  }

  if (facts.expectedSlippageBps >= config.criticalSlippageBps) {
    findings.push({ score: 70, code: RiskReasonCode.ExcessiveExpectedSlippage, severity: "high", message: "expected slippage reached the critical threshold", evidenceIds: facts.evidenceIds.quote === null ? [] : [facts.evidenceIds.quote] });
  } else if (facts.expectedSlippageBps >= config.warningSlippageBps) {
    findings.push({ score: 30, code: RiskReasonCode.ExcessiveExpectedSlippage, severity: "medium", message: "expected slippage reached the warning threshold", evidenceIds: facts.evidenceIds.quote === null ? [] : [facts.evidenceIds.quote] });
  }

  if (facts.postTradeAllocationBps > config.maxPostTradeAllocationBps) {
    findings.push({ score: 30, code: RiskReasonCode.HighPortfolioConcentration, severity: "medium", message: "post-trade allocation exceeds the risk warning threshold", evidenceIds: [facts.evidenceIds.balance] });
  }

  if (compareUnsignedDecimals(facts.transactionUsd, config.warningTransactionUsd) >= 0) {
    findings.push({ score: 30, code: RiskReasonCode.LargeTransaction, severity: "medium", message: "transaction size reached the configured risk-review threshold", evidenceIds: facts.evidenceIds.price === null ? [] : [facts.evidenceIds.price] });
  }

  addBandFinding(findings, "token", facts.tokenRisk, facts.evidenceIds.token);
  addBandFinding(findings, "contract", facts.contractRisk, facts.evidenceIds.contract);
  addBandFinding(findings, "destination", facts.destinationRisk, facts.evidenceIds.destination);

  const score = Math.min(100, findings.reduce((total, finding) => total + finding.score, 0));
  const level = levelFor(score);
  const reasons: RiskReason[] = findings.length === 0
    ? [{ code: RiskReasonCode.WithinLimits, severity: "info", message: "all evaluated risk signals are within configured limits", evidenceIds: Object.values(facts.evidenceIds).filter((value): value is string => value !== null) }]
    : findings.map(({ score: _score, ...finding }) => finding);

  return RiskAssessmentSchema.parse({
    assessmentId: request.assessmentId,
    requestId: request.requestId,
    intentId: request.intentId,
    score,
    level,
    recommendedAction: level === "critical" || level === "high" ? "deny" : level === "medium" ? "require_approval" : "continue",
    reasons,
    configVersion: config.version,
    assessedAt: request.evaluatedAt,
  });
}
