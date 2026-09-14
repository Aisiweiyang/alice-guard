import { describe, expect, it } from "vitest";

import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";
import {
  computeExecutionEnvelopeHash,
  createExecutionEnvelope,
  InMemoryExecutionNonceStore,
  validateExecutionEnvelope,
  type ExecutionEnvelope,
} from "../../src/domain/execution-envelope";
import { hashCanonical } from "../../src/domain/hash";
import { createValidatedDemoPlan } from "../fixtures/phase4-fixtures";

const NONCE = "00000000-0000-4000-8000-000000009001";

describe("execution envelope", () => {
  async function fixture() {
    const { plan, intent } = await createValidatedDemoPlan();
    const walletPolicy = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    const intentHash = hashCanonical(intent);
    const riskConfigHash = hashCanonical({ version: "risk.demo.v1" });
    const envelope = createExecutionEnvelope({
      plan,
      intentHash,
      riskConfigHash,
      walletPolicyHash: walletPolicy.walletPolicyHash,
      executionNonce: NONCE,
      expiresAt: "2026-09-13T00:00:05.000Z",
    });
    return { plan, walletPolicy, intentHash, riskConfigHash, envelope };
  }

  it("accepts one matched, unexpired, fully bound envelope", async () => {
    const value = await fixture();
    expect(validateExecutionEnvelope({
      ...value,
      expectedIntentHash: value.intentHash,
      expectedRiskConfigHash: value.riskConfigHash,
      expectedWalletPolicyHash: value.walletPolicy.walletPolicyHash,
      walletPolicyStatus: "MATCHED",
      now: "2026-09-13T00:00:01.000Z",
    }).ok).toBe(true);
  });

  it.each([
    ["DRIFTED", "WALLET_POLICY_NOT_MATCHED"],
    ["NOT_CONFIGURED", "WALLET_POLICY_NOT_MATCHED"],
    ["UNAVAILABLE", "WALLET_POLICY_NOT_MATCHED"],
  ] as const)("fails closed when wallet policy is %s", async (walletPolicyStatus, reason) => {
    const value = await fixture();
    const result = validateExecutionEnvelope({
      ...value,
      expectedIntentHash: value.intentHash,
      expectedRiskConfigHash: value.riskConfigHash,
      expectedWalletPolicyHash: value.walletPolicy.walletPolicyHash,
      walletPolicyStatus,
      now: "2026-09-13T00:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain(reason);
  });

  it("rejects expiry and nonce replay", async () => {
    const value = await fixture();
    const expired = validateExecutionEnvelope({
      ...value,
      expectedIntentHash: value.intentHash,
      expectedRiskConfigHash: value.riskConfigHash,
      expectedWalletPolicyHash: value.walletPolicy.walletPolicyHash,
      walletPolicyStatus: "MATCHED",
      now: "2026-09-13T00:00:05.000Z",
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reasons).toContain("EXECUTION_ENVELOPE_EXPIRED");

    const nonceStore = new InMemoryExecutionNonceStore();
    const input = {
      ...value,
      expectedIntentHash: value.intentHash,
      expectedRiskConfigHash: value.riskConfigHash,
      expectedWalletPolicyHash: value.walletPolicy.walletPolicyHash,
      walletPolicyStatus: "MATCHED" as const,
      now: "2026-09-13T00:00:01.000Z",
      nonceStore,
    };
    expect(validateExecutionEnvelope(input).ok).toBe(true);
    const replay = validateExecutionEnvelope(input);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reasons).toContain("EXECUTION_NONCE_REPLAYED");
  });

  it.each([
    ["intentHash", "EXECUTION_ENVELOPE_INTENT_MISMATCH"],
    ["riskConfigHash", "EXECUTION_ENVELOPE_RISK_CONFIG_MISMATCH"],
    ["walletPolicyHash", "EXECUTION_ENVELOPE_WALLET_POLICY_MISMATCH"],
    ["planHash", "EXECUTION_ENVELOPE_PLAN_MISMATCH"],
  ] as const)("rejects a re-sealed %s mutation", async (field, reason) => {
    const value = await fixture();
    const changed = { ...value.envelope, [field]: `0x${"ab".repeat(32)}` } as ExecutionEnvelope;
    const resealed = { ...changed, envelopeHash: computeExecutionEnvelopeHash(changed) };
    const result = validateExecutionEnvelope({
      envelope: resealed,
      plan: value.plan,
      expectedIntentHash: value.intentHash,
      expectedRiskConfigHash: value.riskConfigHash,
      expectedWalletPolicyHash: value.walletPolicy.walletPolicyHash,
      walletPolicyStatus: "MATCHED",
      now: "2026-09-13T00:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain(reason);
  });
});
