import { createDemoPolicy } from "../../src/config/policies";
import type {
  PolicyEvaluationRequest,
  PolicyFacts,
  RiskEvaluationRequest,
  RiskFacts,
} from "../../src/domain/evaluation";
import type { AgentIntent, RiskAssessment } from "../../src/domain/schemas";

export const NOW = "2026-09-13T00:00:00.000Z";
export const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
export const INTENT_ID = "00000000-0000-4000-8000-000000000002";
export const ASSESSMENT_ID = "00000000-0000-4000-8000-000000000003";
export const DECISION_ID = "00000000-0000-4000-8000-000000000004";
export const HASH = `0x${"11".repeat(32)}` as `0x${string}`;
export const RECIPIENT = `0x${"22".repeat(20)}` as const;

export const intent: AgentIntent = {
  schemaVersion: "1.0.0",
  intentId: INTENT_ID,
  requestId: REQUEST_ID,
  action: "swap_exact_in",
  network: "monad-testnet",
  chainId: 10143,
  assetInSymbol: "USDC",
  assetOutSymbol: "MON",
  amountIn: "20",
  amountUnit: "asset_in",
  maxSlippageBps: 100,
  ambiguity: "none",
  parsedAt: NOW,
};

export const baseRiskFacts: RiskFacts = {
  transactionUsd: "20",
  amountInRaw: "20000000",
  walletAssetBalanceRaw: "100000000",
  nativeBalanceRaw: "1000000000000000000",
  estimatedGasCostRaw: "1000000000000000",
  minimumNativeReserveRaw: "10000000000000000",
  postTradeAllocationBps: 300,
  priceObservedAt: "2026-09-12T23:59:30.000Z",
  quoteObservedAt: "2026-09-12T23:59:50.000Z",
  quoteExpiresAt: "2026-09-13T00:00:10.000Z",
  liquidityUsd: "1000000",
  volatilityBps: 100,
  expectedSlippageBps: 30,
  tokenRisk: "low",
  contractRisk: "low",
  destinationRisk: "low",
  evidenceIds: {
    balance: "evidence.balance",
    gas: "evidence.gas",
    price: "evidence.price",
    quote: "evidence.quote",
    liquidity: "evidence.liquidity",
    token: "evidence.token",
    contract: "evidence.contract",
    destination: "evidence.destination",
  },
};

type RiskFactsOverride = Omit<Partial<RiskFacts>, "evidenceIds"> & {
  evidenceIds?: Partial<RiskFacts["evidenceIds"]>;
};

export function makeRiskRequest(overrides: RiskFactsOverride = {}): RiskEvaluationRequest {
  return {
    assessmentId: ASSESSMENT_ID,
    requestId: REQUEST_ID,
    intentId: INTENT_ID,
    evaluatedAt: NOW,
    config: {
      version: "risk.v1",
      maxPriceAgeSeconds: 120,
      maxQuoteAgeSeconds: 20,
      futureTimestampToleranceSeconds: 5,
      warningVolatilityBps: 500,
      criticalVolatilityBps: 1500,
      warningSlippageBps: 75,
      criticalSlippageBps: 150,
      maxPostTradeAllocationBps: 500,
      warningTransactionUsd: "50",
      minimumLiquidityUsd: "100000",
    },
    facts: {
      ...baseRiskFacts,
      ...overrides,
      evidenceIds: { ...baseRiskFacts.evidenceIds, ...overrides.evidenceIds },
    },
  };
}

export const lowRiskAssessment: RiskAssessment = {
  assessmentId: ASSESSMENT_ID,
  requestId: REQUEST_ID,
  intentId: INTENT_ID,
  score: 0,
  level: "low",
  recommendedAction: "continue",
  reasons: [{ code: "RISK_WITHIN_LIMITS", severity: "info", message: "within limits", evidenceIds: [] }],
  configVersion: "risk.v1",
  assessedAt: NOW,
};

export const basePolicyFacts: PolicyFacts = {
  assetInId: "monad-testnet:KURU-USDC",
  assetOutId: "monad-testnet:MON",
  contractId: "kuru.testnet.swap",
  recipient: RECIPIENT,
  transactionUsd: "20",
  rollingSpentUsd: "0",
  rollingReservedUsd: "0",
  slippageBps: 100,
  nativeBalanceRaw: "1000000000000000000",
  estimatedGasCostRaw: "1000000000000000",
  postTradeAllocationBps: 500,
  evidenceAgeSeconds: {
    balance: 1,
    allowance: 1,
    price: 30,
    quote: 10,
    gas: 1,
    "chain-state": 1,
    configuration: 1,
  },
  calldataKnown: true,
};

type PolicyFactsOverride = Omit<Partial<PolicyFacts>, "evidenceAgeSeconds"> & {
  evidenceAgeSeconds?: Partial<PolicyFacts["evidenceAgeSeconds"]>;
};

export function makePolicyRequest(
  factsOverride: PolicyFactsOverride = {},
  riskAssessment: RiskAssessment = lowRiskAssessment,
): PolicyEvaluationRequest {
  return {
    decisionId: DECISION_ID,
    requestId: REQUEST_ID,
    intent,
    riskAssessment,
    facts: {
      ...basePolicyFacts,
      ...factsOverride,
      evidenceAgeSeconds: { ...basePolicyFacts.evidenceAgeSeconds, ...factsOverride.evidenceAgeSeconds },
    },
    policy: createDemoPolicy({
      policyId: "alice-guard.demo",
      version: "policy.v1",
      configHash: HASH,
      createdAt: NOW,
      recipient: RECIPIENT,
      contractId: "kuru.testnet.swap",
      minimumNativeReserveRaw: "10000000000000000",
    }),
    decidedAt: NOW,
  };
}
