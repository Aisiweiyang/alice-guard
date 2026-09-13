import { z } from "zod";

import { AgentIntentSchema, DecimalStringSchema, IdentSchema, IsoDateTimeSchema, SchemaVersion } from "./schemas";

const PositiveDecimalStringSchema = DecimalStringSchema.refine((value) => /[1-9]/.test(value), {
  message: "amount must be greater than zero",
});

export const SwapIntentProposalSchema = z
  .object({
    kind: z.literal("swap_exact_in"),
    amountIn: PositiveDecimalStringSchema,
    maxSlippageBps: z.number().int().min(0).max(10_000).nullable(),
  })
  .strict();

export const RejectedIntentProposalSchema = z
  .object({
    kind: z.literal("reject"),
    reason: z.enum([
      "unsupported_action",
      "ambiguous_request",
      "missing_amount",
      "missing_assets",
      "policy_manipulation",
    ]),
  })
  .strict();

export const IntentProposalSchema = z.discriminatedUnion("kind", [
  SwapIntentProposalSchema,
  RejectedIntentProposalSchema,
]);

export const OriginClaimsSchema = z
  .object({
    supportedActionMentioned: z.boolean(),
    conflictingActionMentioned: z.boolean(),
    assetInMentioned: z.boolean(),
    assetOutMentioned: z.boolean(),
    amountCandidates: z.array(PositiveDecimalStringSchema).max(10),
    slippageCandidatesBps: z.array(z.number().int().min(0).max(10_000)).max(10),
  })
  .strict();

export const IntentParseIssueSchema = z
  .object({
    code: IdentSchema,
    message: z.string().min(1).max(500),
    path: z.string().max(256),
  })
  .strict();

const ParseResultBaseSchema = z.object({
  schemaVersion: z.literal(SchemaVersion),
  requestId: z.string().uuid(),
  parsedAt: IsoDateTimeSchema,
  providerId: IdentSchema,
});

export const IntentParseAcceptedSchema = ParseResultBaseSchema.extend({
  status: z.literal("accepted"),
  intent: AgentIntentSchema,
  originClaims: OriginClaimsSchema,
}).strict();

export const IntentParseRejectedSchema = ParseResultBaseSchema.extend({
  status: z.literal("rejected"),
  rejectionCode: z.enum([
    "MODEL_REJECTED",
    "MODEL_OUTPUT_INVALID",
    "ORIGIN_MISMATCH",
    "AMBIGUOUS_REQUEST",
    "PROVIDER_ERROR",
  ]),
  issues: z.array(IntentParseIssueSchema).min(1).max(100),
  originClaims: OriginClaimsSchema.nullable(),
}).strict();

export const IntentParseResultSchema = z.discriminatedUnion("status", [
  IntentParseAcceptedSchema,
  IntentParseRejectedSchema,
]);

export type IntentProposal = z.infer<typeof IntentProposalSchema>;
export type SwapIntentProposal = z.infer<typeof SwapIntentProposalSchema>;
export type OriginClaims = z.infer<typeof OriginClaimsSchema>;
export type IntentParseIssue = z.infer<typeof IntentParseIssueSchema>;
export type IntentParseResult = z.infer<typeof IntentParseResultSchema>;
