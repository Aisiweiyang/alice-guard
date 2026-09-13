import { z } from "zod";

import { Bytes32Schema, EvmAddressSchema, IdentSchema, UintStringSchema } from "../domain/schemas";
import { DEMO_SCENARIOS } from "../demo/demo-template";

const scenarioNames = DEMO_SCENARIOS.map((scenario) => scenario.name) as [
  (typeof DEMO_SCENARIOS)[number]["name"],
  ...(typeof DEMO_SCENARIOS)[number]["name"][],
];

export const DemoScenarioNameSchema = z.enum(scenarioNames);

export const DemoRunRequestSchema = z
  .object({
    scenario: DemoScenarioNameSchema,
  })
  .strict();

export const DemoHealthSchema = z
  .object({
    service: z.literal("alice-guard-demo"),
    mode: z.literal("offline-demo-no-wallet"),
    walletEnabled: z.literal(false),
    signingEnabled: z.literal(false),
    broadcastEnabled: z.literal(false),
  })
  .strict();

const SafeReasonSchema = z
  .object({
    code: IdentSchema,
    severity: z.enum(["info", "low", "medium", "high", "critical"]).nullable(),
    message: z.string().min(1).max(500),
  })
  .strict();

const TransactionPresentationSchema = z
  .object({
    sequence: z.number().int().min(0).max(1),
    purpose: z.enum(["approve_exact", "swap_exact_in"]),
    target: EvmAddressSchema,
    gasLimit: UintStringSchema,
    explanation: z.string().min(1).max(300),
    spender: EvmAddressSchema.nullable(),
    market: EvmAddressSchema.nullable(),
    amountRaw: UintStringSchema,
    minAmountOutRaw: UintStringSchema.nullable(),
  })
  .strict();

export const DemoPresentationSchema = z
  .object({
    scenario: DemoScenarioNameSchema,
    title: z.string().min(1).max(128),
    request: z.string().min(1).max(2_000),
    mode: z.literal("offline-demo-no-wallet"),
    status: z.enum(["prepared", "requires_approval", "denied"]),
    stoppedAt: z.enum(["intent", "risk", "policy", "plan"]),
    intent: z
      .object({
        action: z.literal("swap_exact_in"),
        amountIn: z.string(),
        assetIn: z.literal("USDC"),
        assetOut: z.literal("MON"),
        maxSlippageBps: z.number().int(),
      })
      .strict()
      .nullable(),
    risk: z
      .object({
        score: z.number().int().min(0).max(100),
        level: z.enum(["low", "medium", "high", "critical"]),
        reasons: z.array(SafeReasonSchema),
      })
      .strict()
      .nullable(),
    policy: z
      .object({
        decision: z.enum(["deny", "require_approval", "allow"]),
        reasons: z.array(SafeReasonSchema),
        trace: z.array(
          z
            .object({
              ruleId: IdentSchema,
              ruleType: IdentSchema,
              outcome: z.enum(["pass", "deny", "require_approval", "skipped"]),
              reasonCode: IdentSchema,
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
    plan: z
      .object({
        planHash: Bytes32Schema,
        validated: z.literal(true),
        transactionCount: z.number().int().min(1).max(2),
        transactions: z.array(TransactionPresentationSchema).min(1).max(2),
      })
      .strict()
      .nullable(),
    checks: z
      .object({
        intentAccepted: z.boolean(),
        evidenceCollected: z.boolean(),
        riskEvaluated: z.boolean(),
        policyEvaluated: z.boolean(),
        planCreated: z.boolean(),
        planValidated: z.boolean(),
      })
      .strict(),
    reasonCodes: z.array(IdentSchema),
    audit: z
      .object({
        auditHash: Bytes32Schema,
        previousAuditHash: Bytes32Schema.nullable(),
        chainValid: z.boolean(),
        events: z.array(
          z.object({ type: IdentSchema, actor: IdentSchema, safeSummary: z.string().min(1).max(1_000) }).strict(),
        ),
      })
      .strict(),
    execution: z.literal("not_attempted"),
    capabilities: z
      .object({ wallet: z.literal(false), signing: z.literal(false), broadcast: z.literal(false) })
      .strict(),
  })
  .strict();

export const SafeAuditSummarySchema = z
  .object({
    requestId: z.string().uuid(),
    status: z.enum(["prepared", "requires_approval", "denied", "recorded"]),
    auditHash: Bytes32Schema,
    previousAuditHash: Bytes32Schema.nullable(),
    eventCount: z.number().int().positive(),
  })
  .strict();

export const SafeApiErrorSchema = z
  .object({
    error: z.object({ code: IdentSchema, message: z.string().min(1).max(200) }).strict(),
  })
  .strict();

export type DemoRunRequest = z.infer<typeof DemoRunRequestSchema>;
export type DemoPresentation = z.infer<typeof DemoPresentationSchema>;
export type SafeAuditSummary = z.infer<typeof SafeAuditSummarySchema>;
