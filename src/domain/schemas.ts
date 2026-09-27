import { z } from "zod";
import { DecisionCapsuleSchema } from "./decision-capsule-shape";

/**
 * Phase 0 domain contract. External data enters the system as `unknown` and must
 * cross one of these strict schemas before deterministic application logic uses it.
 * This file intentionally contains no network, wallet, database, or LLM code.
 */

export const SchemaVersion = "1.0.0" as const;

export const MonadChainIdSchema = z.union([z.literal(10143), z.literal(143)]);
export const NetworkSchema = z.enum(["monad-testnet", "monad-mainnet"]);
export const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "invalid EVM address");
export const HexDataSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/, "invalid hex data");
export const Bytes4Schema = z.string().regex(/^0x[0-9a-fA-F]{8}$/, "invalid function selector");
export const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid bytes32");
export const UintStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/, "expected canonical unsigned integer");
export const DecimalStringSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/, "expected canonical non-negative decimal");
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const BasisPointsSchema = z.number().int().min(0).max(10_000);
export const UsdAmountSchema = DecimalStringSchema.describe("Canonical USD decimal string; never JS float");

export const IdentSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/);

export const PolicyRuleTypeSchema = z.enum([
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

function assertNetworkMatchesChain(
  value: { network: z.infer<typeof NetworkSchema>; chainId: z.infer<typeof MonadChainIdSchema> },
  ctx: z.RefinementCtx,
): void {
  const expected = value.network === "monad-mainnet" ? 143 : 10143;
  if (value.chainId !== expected) {
    ctx.addIssue({ code: "custom", path: ["chainId"], message: `chainId must be ${expected} for ${value.network}` });
  }
}

export const UserRequestSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    requestId: z.string().uuid(),
    userId: IdentSchema,
    channel: z.enum(["cli", "web", "api"]),
    text: z.string().trim().min(1).max(2_000),
    receivedAt: IsoDateTimeSchema,
  })
  .strict();

const AssetMetadataSchema = z
  .object({
    sourceUrl: z.string().url(),
    sourceRevision: z.string().min(1).max(128),
    verifiedAt: IsoDateTimeSchema,
  })
  .strict();

export const NativeAssetSchema = z
  .object({
    kind: z.literal("native"),
    assetId: IdentSchema,
    chainId: MonadChainIdSchema,
    symbol: z.literal("MON"),
    name: z.string().min(1).max(64),
    decimals: z.literal(18),
    metadata: AssetMetadataSchema,
  })
  .strict();

export const Erc20AssetSchema = z
  .object({
    kind: z.literal("erc20"),
    assetId: IdentSchema,
    chainId: MonadChainIdSchema,
    address: EvmAddressSchema,
    symbol: z.string().regex(/^[A-Z0-9]{2,12}$/),
    name: z.string().min(1).max(64),
    decimals: z.number().int().min(0).max(255),
    metadata: AssetMetadataSchema,
  })
  .strict();

export const AssetSchema = z.discriminatedUnion("kind", [NativeAssetSchema, Erc20AssetSchema]);
export const ActionSchema = z.literal("swap_exact_in");

export const AgentIntentSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    intentId: z.string().uuid(),
    requestId: z.string().uuid(),
    action: ActionSchema,
    network: NetworkSchema,
    chainId: MonadChainIdSchema,
    assetInSymbol: z.enum(["USDC", "MON"]),
    assetOutSymbol: z.enum(["USDC", "MON"]),
    amountIn: DecimalStringSchema,
    amountUnit: z.literal("asset_in"),
    maxSlippageBps: z.number().int().min(1).max(1_000),
    ambiguity: z.enum(["none", "requires_clarification"]),
    parsedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    assertNetworkMatchesChain(value, ctx);
    if (value.assetInSymbol === value.assetOutSymbol) {
      ctx.addIssue({ code: "custom", path: ["assetOutSymbol"], message: "input and output assets must differ" });
    }
    if (value.assetInSymbol !== "USDC" || value.assetOutSymbol !== "MON") {
      ctx.addIssue({ code: "custom", path: ["assetOutSymbol"], message: "MVP supports only USDC to MON" });
    }
    if (!/[1-9]/.test(value.amountIn)) {
      ctx.addIssue({ code: "custom", path: ["amountIn"], message: "amount must be greater than zero" });
    }
  });

export const EvidenceItemSchema = z
  .object({
    evidenceId: IdentSchema,
    kind: z.enum(["balance", "allowance", "price", "quote", "gas", "chain-state", "configuration"]),
    source: z.enum(["rpc", "chainlink", "dex", "registry", "local-config"]),
    observedAt: IsoDateTimeSchema,
    blockNumber: UintStringSchema.nullable(),
    valueHash: Bytes32Schema,
    freshUntil: IsoDateTimeSchema,
  })
  .strict();

export const RiskReasonSchema = z
  .object({
    code: IdentSchema,
    severity: z.enum(["info", "low", "medium", "high", "critical"]),
    message: z.string().min(1).max(500),
    evidenceIds: z.array(IdentSchema).max(32),
  })
  .strict();

export const RiskAssessmentSchema = z
  .object({
    assessmentId: z.string().uuid(),
    requestId: z.string().uuid(),
    intentId: z.string().uuid(),
    score: z.number().int().min(0).max(100),
    level: z.enum(["low", "medium", "high", "critical"]),
    recommendedAction: z.enum(["continue", "require_approval", "deny"]),
    reasons: z.array(RiskReasonSchema).min(1).max(64),
    configVersion: IdentSchema,
    assessedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedLevel = value.score >= 90 ? "critical" : value.score >= 70 ? "high" : value.score >= 30 ? "medium" : "low";
    const expectedAction = expectedLevel === "high" || expectedLevel === "critical" ? "deny" : expectedLevel === "medium" ? "require_approval" : "continue";
    if (value.level !== expectedLevel) {
      ctx.addIssue({ code: "custom", path: ["level"], message: `level must be ${expectedLevel} for score ${value.score}` });
    }
    if (value.recommendedAction !== expectedAction) {
      ctx.addIssue({ code: "custom", path: ["recommendedAction"], message: `recommendedAction must be ${expectedAction} for level ${expectedLevel}` });
    }
  });

const RuleBase = {
  ruleId: IdentSchema,
  enabled: z.boolean(),
} as const;

export const PolicyRuleSchema = z.discriminatedUnion("type", [
  z.object({ ...RuleBase, type: z.literal("allowed_chain_ids"), chainIds: z.array(MonadChainIdSchema).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("allowed_actions"), actions: z.array(ActionSchema).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("token_allowlist"), assetIds: z.array(IdentSchema).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("contract_allowlist"), contractIds: z.array(IdentSchema).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("recipient_allowlist"), recipients: z.array(EvmAddressSchema).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("max_transaction_usd"), maxUsd: UsdAmountSchema }).strict(),
  z.object({ ...RuleBase, type: z.literal("rolling_spend_usd"), maxUsd: UsdAmountSchema, windowSeconds: z.number().int().positive() }).strict(),
  z.object({ ...RuleBase, type: z.literal("human_approval_threshold_usd"), thresholdUsd: UsdAmountSchema }).strict(),
  z.object({ ...RuleBase, type: z.literal("max_slippage_bps"), maxBps: BasisPointsSchema }).strict(),
  z.object({ ...RuleBase, type: z.literal("min_native_reserve"), minRaw: UintStringSchema }).strict(),
  z.object({ ...RuleBase, type: z.literal("max_portfolio_allocation_bps"), assetId: IdentSchema, maxBps: BasisPointsSchema }).strict(),
  z.object({ ...RuleBase, type: z.literal("max_data_age_seconds"), evidenceKind: EvidenceItemSchema.shape.kind, maxAgeSeconds: z.number().int().positive() }).strict(),
  z.object({ ...RuleBase, type: z.literal("deny_risk_levels"), levels: z.array(z.enum(["low", "medium", "high", "critical"])).min(1) }).strict(),
  z.object({ ...RuleBase, type: z.literal("known_calldata_only"), required: z.literal(true) }).strict(),
]);

export const PolicySchema = z
  .object({
    policyId: IdentSchema,
    version: IdentSchema,
    defaultEffect: z.literal("deny"),
    rules: z.array(PolicyRuleSchema).min(1).max(100),
    configHash: Bytes32Schema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const PolicyReasonSchema = z
  .object({
    code: IdentSchema,
    ruleId: IdentSchema.nullable(),
    message: z.string().min(1).max(500),
    evidenceIds: z.array(IdentSchema).max(32),
  })
  .strict();

export const PolicyDecisionSchema = z
  .object({
    decisionId: z.string().uuid(),
    requestId: z.string().uuid(),
    intentId: z.string().uuid(),
    decision: z.enum(["deny", "require_approval", "allow"]),
    reasons: z.array(PolicyReasonSchema).min(1).max(100),
    evaluatedRuleIds: z.array(IdentSchema).min(1).max(100),
    policyId: IdentSchema,
    policyVersion: IdentSchema,
    policyHash: Bytes32Schema,
    decidedAt: IsoDateTimeSchema,
  })
  .strict();

export const ContractPermissionSchema = z
  .object({
    contractId: IdentSchema,
    chainId: MonadChainIdSchema,
    address: EvmAddressSchema,
    codeHash: Bytes32Schema.nullable(),
    allowedFunctions: z
      .array(
        z
          .object({
            name: z.string().min(1).max(128),
            selector: Bytes4Schema,
            abiId: IdentSchema,
            parameterConstraints: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1),
    verifiedAt: IsoDateTimeSchema,
  })
  .strict();

export const WalletPermissionSchema = z
  .object({
    permissionId: IdentSchema,
    walletId: IdentSchema,
    walletAddress: EvmAddressSchema,
    chainIds: z.array(MonadChainIdSchema).min(1),
    allowedMethods: z.array(z.literal("eth_sendTransaction")).length(1),
    contracts: z.array(ContractPermissionSchema).min(1),
    allowedRecipients: z.array(EvmAddressSchema).min(1),
    maxNativeValueRaw: UintStringSchema,
    deniedMethods: z.array(z.enum(["personal_sign", "eth_sign", "eth_signTypedData", "eth_signTypedData_v4"])).min(1),
    expiresAt: IsoDateTimeSchema,
    policyId: IdentSchema,
  })
  .strict();

export const DecodedCallSchema = z
  .object({
    abiId: IdentSchema,
    functionName: z.string().min(1).max(128),
    selector: Bytes4Schema,
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();

export const PlannedTransactionSchema = z
  .object({
    sequence: z.number().int().min(0).max(1),
    purpose: z.enum(["approve_exact", "swap_exact_in"]),
    chainId: MonadChainIdSchema,
    to: EvmAddressSchema,
    valueRaw: UintStringSchema,
    data: HexDataSchema,
    gasLimit: UintStringSchema,
    decodedCall: DecodedCallSchema,
  })
  .strict();

export const TransactionPlanSchema = z
  .object({
    planId: z.string().uuid(),
    requestId: z.string().uuid(),
    intentId: z.string().uuid(),
    network: NetworkSchema,
    chainId: MonadChainIdSchema,
    walletAddress: EvmAddressSchema,
    transactions: z.array(PlannedTransactionSchema).min(1).max(2),
    quoteId: IdentSchema,
    quoteExpiresAt: IsoDateTimeSchema,
    evidenceHash: Bytes32Schema,
    policyHash: Bytes32Schema,
    planHash: Bytes32Schema,
    status: z.enum(["draft", "validated"]),
    createdAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    assertNetworkMatchesChain(value, ctx);
    value.transactions.forEach((transaction, index) => {
      if (transaction.sequence !== index) {
        ctx.addIssue({ code: "custom", path: ["transactions", index, "sequence"], message: "sequence must match array order" });
      }
      if (transaction.chainId !== value.chainId) {
        ctx.addIssue({ code: "custom", path: ["transactions", index, "chainId"], message: "transaction chain must match plan" });
      }
    });
  });

export const ApprovalRequestSchema = z
  .object({
    approvalId: z.string().uuid(),
    requestId: z.string().uuid(),
    planId: z.string().uuid(),
    planHash: Bytes32Schema,
    policyHash: Bytes32Schema,
    reasonCodes: z.array(IdentSchema).min(1),
    status: z.enum(["pending", "approved", "rejected", "expired"]),
    requestedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    decidedAt: IsoDateTimeSchema.nullable(),
    approverId: IdentSchema.nullable(),
  })
  .strict();

export const ReceiptSummarySchema = z
  .object({
    transactionHash: Bytes32Schema,
    blockNumber: UintStringSchema,
    status: z.enum(["success", "reverted"]),
    gasUsed: UintStringSchema,
  })
  .strict();

export const ExecutionResultSchema = z
  .object({
    attemptId: z.string().uuid(),
    planId: z.string().uuid(),
    idempotencyKey: Bytes32Schema,
    status: z.enum(["not_attempted", "submitting", "pending", "confirmed", "reverted", "failed", "unknown"]),
    transactionHashes: z.array(Bytes32Schema).max(2),
    receipts: z.array(ReceiptSummarySchema).max(2),
    error: z
      .object({ code: IdentSchema, safeMessage: z.string().min(1).max(500), retryable: z.boolean() })
      .strict()
      .nullable(),
    startedAt: IsoDateTimeSchema,
    finishedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const ValidationSummarySchema = z
  .object({
    success: z.boolean(),
    issues: z.array(z.object({ path: z.string(), code: IdentSchema, message: z.string().max(500) }).strict()).max(100),
  })
  .strict();

export const AuditEventSchema = z
  .object({
    eventId: z.string().uuid(),
    type: IdentSchema,
    actor: z.enum(["user", "llm", "policy-engine", "plan-guard", "wallet", "chain", "system"]),
    occurredAt: IsoDateTimeSchema,
    payloadHash: Bytes32Schema,
    safeSummary: z.string().min(1).max(1_000),
  })
  .strict();

export const AuditRecordSchema = z
  .object({
    decisionCapsule: DecisionCapsuleSchema.optional(),
    // Parsed as strict DecisionMaterialSchema by the replay boundary. Kept as
    // JSON here to avoid a recursive audit -> material -> domain schema graph.
    decisionMaterialJson: z.string().min(2).max(250_000).optional(),
    auditId: z.string().uuid(),
    request: UserRequestSchema,
    intentValidation: ValidationSummarySchema,
    parsedIntent: AgentIntentSchema.nullable(),
    evidence: z.array(EvidenceItemSchema).max(100),
    riskAssessment: RiskAssessmentSchema.nullable(),
    policyDecision: PolicyDecisionSchema.nullable(),
    transactionPlan: TransactionPlanSchema.nullable(),
    approval: ApprovalRequestSchema.nullable(),
    execution: ExecutionResultSchema.nullable(),
    events: z.array(AuditEventSchema).min(1).max(1_000),
    previousRecordHash: Bytes32Schema.nullable(),
    recordHash: Bytes32Schema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type UserRequest = z.infer<typeof UserRequestSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type AgentIntent = z.infer<typeof AgentIntentSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type RiskReason = z.infer<typeof RiskReasonSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PolicyReason = z.infer<typeof PolicyReasonSchema>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export type WalletPermission = z.infer<typeof WalletPermissionSchema>;
export type ContractPermission = z.infer<typeof ContractPermissionSchema>;
export type PlannedTransaction = z.infer<typeof PlannedTransactionSchema>;
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditRecord = z.infer<typeof AuditRecordSchema>;
