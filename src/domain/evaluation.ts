import { z } from "zod";

import {
  AgentIntentSchema,
  DecimalStringSchema,
  EvmAddressSchema,
  EvidenceItemSchema,
  IdentSchema,
  IsoDateTimeSchema,
  PolicyDecisionSchema,
  PolicyRuleTypeSchema,
  PolicySchema,
  RiskAssessmentSchema,
  UintStringSchema,
} from "./schemas";

const RiskBandSchema = z.enum(["low", "medium", "high", "critical"]);

export const RiskConfigSchema = z
  .object({
    version: IdentSchema,
    maxPriceAgeSeconds: z.number().int().positive(),
    maxQuoteAgeSeconds: z.number().int().positive(),
    futureTimestampToleranceSeconds: z.number().int().min(0).max(300),
    warningVolatilityBps: z.number().int().min(0).max(10_000),
    criticalVolatilityBps: z.number().int().min(0).max(10_000),
    warningSlippageBps: z.number().int().min(0).max(10_000),
    criticalSlippageBps: z.number().int().min(0).max(10_000),
    maxPostTradeAllocationBps: z.number().int().min(0).max(10_000),
    warningTransactionUsd: DecimalStringSchema,
    minimumLiquidityUsd: DecimalStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.warningVolatilityBps > value.criticalVolatilityBps) {
      ctx.addIssue({ code: "custom", path: ["warningVolatilityBps"], message: "warning must not exceed critical" });
    }
    if (value.warningSlippageBps > value.criticalSlippageBps) {
      ctx.addIssue({ code: "custom", path: ["warningSlippageBps"], message: "warning must not exceed critical" });
    }
  });

export const RiskFactsSchema = z
  .object({
    transactionUsd: DecimalStringSchema,
    amountInRaw: UintStringSchema,
    walletAssetBalanceRaw: UintStringSchema,
    nativeBalanceRaw: UintStringSchema,
    estimatedGasCostRaw: UintStringSchema,
    minimumNativeReserveRaw: UintStringSchema,
    postTradeAllocationBps: z.number().int().min(0).max(10_000),
    priceObservedAt: IsoDateTimeSchema.nullable(),
    quoteObservedAt: IsoDateTimeSchema.nullable(),
    quoteExpiresAt: IsoDateTimeSchema.nullable(),
    liquidityUsd: DecimalStringSchema.nullable(),
    volatilityBps: z.number().int().min(0).max(100_000),
    expectedSlippageBps: z.number().int().min(0).max(10_000),
    tokenRisk: RiskBandSchema,
    contractRisk: RiskBandSchema,
    destinationRisk: RiskBandSchema,
    evidenceIds: z
      .object({
        balance: IdentSchema,
        gas: IdentSchema,
        price: IdentSchema.nullable(),
        quote: IdentSchema.nullable(),
        liquidity: IdentSchema.nullable(),
        token: IdentSchema,
        contract: IdentSchema,
        destination: IdentSchema,
      })
      .strict(),
  })
  .strict();

export const RiskEvaluationRequestSchema = z
  .object({
    assessmentId: z.string().uuid(),
    requestId: z.string().uuid(),
    intentId: z.string().uuid(),
    facts: RiskFactsSchema,
    config: RiskConfigSchema,
    evaluatedAt: IsoDateTimeSchema,
  })
  .strict();

export const PolicyFactsSchema = z
  .object({
    assetInId: IdentSchema,
    assetOutId: IdentSchema,
    contractId: IdentSchema,
    recipient: EvmAddressSchema,
    transactionUsd: DecimalStringSchema,
    rollingSpentUsd: DecimalStringSchema,
    rollingReservedUsd: DecimalStringSchema,
    slippageBps: z.number().int().min(0).max(10_000),
    nativeBalanceRaw: UintStringSchema,
    estimatedGasCostRaw: UintStringSchema,
    postTradeAllocationBps: z.number().int().min(0).max(10_000),
    evidenceAgeSeconds: z
      .object({
        balance: z.number().int().min(0).nullable(),
        allowance: z.number().int().min(0).nullable(),
        price: z.number().int().min(0).nullable(),
        quote: z.number().int().min(0).nullable(),
        gas: z.number().int().min(0).nullable(),
        "chain-state": z.number().int().min(0).nullable(),
        configuration: z.number().int().min(0).nullable(),
      })
      .strict(),
    calldataKnown: z.boolean(),
  })
  .strict();

export const PolicyEvaluationRequestSchema = z
  .object({
    decisionId: z.string().uuid(),
    requestId: z.string().uuid(),
    intent: AgentIntentSchema,
    riskAssessment: RiskAssessmentSchema,
    facts: PolicyFactsSchema,
    policy: PolicySchema,
    decidedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.requestId !== value.intent.requestId || value.requestId !== value.riskAssessment.requestId) {
      ctx.addIssue({ code: "custom", path: ["requestId"], message: "request, intent, and risk assessment IDs must match" });
    }
    if (value.intent.intentId !== value.riskAssessment.intentId) {
      ctx.addIssue({ code: "custom", path: ["riskAssessment", "intentId"], message: "risk assessment must bind to the same intent" });
    }
  });

export const PolicyRuleTraceSchema = z
  .object({
    ruleId: IdentSchema,
    ruleType: PolicyRuleTypeSchema,
    outcome: z.enum(["pass", "deny", "require_approval", "skipped"]),
    reasonCode: IdentSchema,
  })
  .strict();

export const PolicyEvaluationSchema = z
  .object({
    decision: PolicyDecisionSchema,
    trace: z.array(PolicyRuleTraceSchema).min(1),
  })
  .strict();

export type RiskConfig = z.infer<typeof RiskConfigSchema>;
export type RiskFacts = z.infer<typeof RiskFactsSchema>;
export type RiskEvaluationRequest = z.infer<typeof RiskEvaluationRequestSchema>;
export type PolicyFacts = z.infer<typeof PolicyFactsSchema>;
export type PolicyEvaluationRequest = z.infer<typeof PolicyEvaluationRequestSchema>;
export type PolicyRuleTrace = z.infer<typeof PolicyRuleTraceSchema>;
export type PolicyEvaluation = z.infer<typeof PolicyEvaluationSchema>;

// Keep imported evidence vocabulary tied to the canonical domain schema.
export type EvidenceKind = z.infer<typeof EvidenceItemSchema>["kind"];
