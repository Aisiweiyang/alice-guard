import { z } from "zod";

import { hashCanonical } from "./hash";
import { computePlanHash } from "../application/build-plan";
import { Bytes32Schema, IsoDateTimeSchema, TransactionPlanSchema, type TransactionPlan } from "./schemas";

export const ExecutionEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    intentHash: Bytes32Schema,
    evidenceHash: Bytes32Schema,
    riskConfigHash: Bytes32Schema,
    applicationPolicyHash: Bytes32Schema,
    walletPolicyHash: Bytes32Schema,
    planHash: Bytes32Schema,
    chainId: z.literal(10143),
    expiresAt: IsoDateTimeSchema,
    executionNonce: z.string().uuid(),
    envelopeHash: Bytes32Schema,
  })
  .strict();

export type ExecutionEnvelope = z.infer<typeof ExecutionEnvelopeSchema>;

export interface CreateExecutionEnvelopeInput {
  plan: TransactionPlan;
  intentHash: string;
  riskConfigHash: string;
  walletPolicyHash: string;
  executionNonce: string;
  expiresAt: string;
}

export interface ExecutionNonceStore {
  consume(nonce: string): boolean;
}

export interface ValidateExecutionEnvelopeInput {
  envelope: ExecutionEnvelope;
  plan: TransactionPlan;
  expectedIntentHash: string;
  expectedRiskConfigHash: string;
  expectedWalletPolicyHash: string;
  walletPolicyStatus: "MATCHED" | "DRIFTED" | "NOT_CONFIGURED" | "UNAVAILABLE";
  now: string;
  nonceStore?: ExecutionNonceStore;
}

export type ExecutionEnvelopeValidation =
  | { ok: true; envelope: ExecutionEnvelope }
  | { ok: false; reasons: string[] };

function envelopeHashMaterial(envelope: ExecutionEnvelope): unknown {
  const { envelopeHash: _envelopeHash, ...material } = envelope;
  return material;
}

export function computeExecutionEnvelopeHash(envelope: ExecutionEnvelope): `0x${string}` {
  return hashCanonical(envelopeHashMaterial(envelope));
}

export function createExecutionEnvelope(input: CreateExecutionEnvelopeInput): ExecutionEnvelope {
  const plan = TransactionPlanSchema.parse(input.plan);
  if (plan.status !== "validated" || plan.chainId !== 10143 || plan.network !== "monad-testnet") {
    throw new Error("EXECUTION_ENVELOPE_REQUIRES_VALIDATED_TESTNET_PLAN");
  }
  const unsigned = ExecutionEnvelopeSchema.parse({
    requestId: plan.requestId,
    intentHash: input.intentHash,
    evidenceHash: plan.evidenceHash,
    riskConfigHash: input.riskConfigHash,
    applicationPolicyHash: plan.policyHash,
    walletPolicyHash: input.walletPolicyHash,
    planHash: plan.planHash,
    chainId: plan.chainId,
    expiresAt: input.expiresAt,
    executionNonce: input.executionNonce,
    envelopeHash: `0x${"00".repeat(32)}`,
  });
  if (Date.parse(unsigned.expiresAt) > Date.parse(plan.quoteExpiresAt)) {
    throw new Error("EXECUTION_ENVELOPE_OUTLIVES_QUOTE");
  }
  return ExecutionEnvelopeSchema.parse({ ...unsigned, envelopeHash: computeExecutionEnvelopeHash(unsigned) });
}

export function validateExecutionEnvelope(input: ValidateExecutionEnvelopeInput): ExecutionEnvelopeValidation {
  const envelopeResult = ExecutionEnvelopeSchema.safeParse(input.envelope);
  const planResult = TransactionPlanSchema.safeParse(input.plan);
  if (!envelopeResult.success || !planResult.success || !Number.isFinite(Date.parse(input.now))) {
    return { ok: false, reasons: ["EXECUTION_ENVELOPE_SCHEMA_INVALID"] };
  }
  const envelope = envelopeResult.data;
  const plan = planResult.data;
  const reasons: string[] = [];
  if (input.walletPolicyStatus !== "MATCHED") reasons.push("WALLET_POLICY_NOT_MATCHED");
  if (plan.status !== "validated") reasons.push("PLAN_NOT_VALIDATED");
  if (plan.planHash !== computePlanHash(plan)) reasons.push("PLAN_HASH_MISMATCH");
  if (Date.parse(input.now) >= Date.parse(envelope.expiresAt)) reasons.push("EXECUTION_ENVELOPE_EXPIRED");
  if (Date.parse(envelope.expiresAt) > Date.parse(plan.quoteExpiresAt)) reasons.push("EXECUTION_ENVELOPE_OUTLIVES_QUOTE");
  if (envelope.envelopeHash !== computeExecutionEnvelopeHash(envelope)) reasons.push("EXECUTION_ENVELOPE_HASH_MISMATCH");
  if (
    envelope.requestId !== plan.requestId ||
    envelope.evidenceHash !== plan.evidenceHash ||
    envelope.applicationPolicyHash !== plan.policyHash ||
    envelope.planHash !== plan.planHash ||
    envelope.chainId !== plan.chainId
  ) reasons.push("EXECUTION_ENVELOPE_PLAN_MISMATCH");
  if (envelope.intentHash !== input.expectedIntentHash) reasons.push("EXECUTION_ENVELOPE_INTENT_MISMATCH");
  if (envelope.riskConfigHash !== input.expectedRiskConfigHash) reasons.push("EXECUTION_ENVELOPE_RISK_CONFIG_MISMATCH");
  if (envelope.walletPolicyHash !== input.expectedWalletPolicyHash) reasons.push("EXECUTION_ENVELOPE_WALLET_POLICY_MISMATCH");
  if (reasons.length === 0 && input.nonceStore && !input.nonceStore.consume(envelope.executionNonce)) {
    reasons.push("EXECUTION_NONCE_REPLAYED");
  }
  return reasons.length === 0 ? { ok: true, envelope } : { ok: false, reasons: [...new Set(reasons)] };
}

export class InMemoryExecutionNonceStore implements ExecutionNonceStore {
  readonly #consumed = new Set<string>();

  consume(nonce: string): boolean {
    if (this.#consumed.has(nonce)) return false;
    this.#consumed.add(nonce);
    return true;
  }
}
