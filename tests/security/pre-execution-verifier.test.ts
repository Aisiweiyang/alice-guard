import { describe, expect, it } from "vitest";

import { verifyPreExecution } from "../../src/application/pre-execution-verifier";
import { createDemoProofFixture } from "../../src/demo/proof-fixture";
import { createDecisionCapsule, type DecisionMaterial } from "../../src/domain/decision-capsule";
import { createExecutionEnvelope } from "../../src/domain/execution-envelope";
import { hashCanonical } from "../../src/domain/hash";
import { evaluatePolicy } from "../../src/engines/policy-engine";
import { evaluateRisk } from "../../src/engines/risk-engine";

/** Model a bad server-side assembly, not just a candidate that differs from its pin. */
async function assembleFixture(mutate: (material: DecisionMaterial) => void) {
  const fixture = await createDemoProofFixture();
  const m = fixture.candidate.material;
  mutate(m);
  m.riskAssessment = evaluateRisk({
    assessmentId: m.riskAssessment.assessmentId,
    requestId: m.request.requestId,
    intentId: m.intent.intentId,
    facts: m.riskFacts,
    config: m.riskConfig,
    evaluatedAt: m.riskAssessment.assessedAt,
  });
  m.policyEvaluation = evaluatePolicy({
    decisionId: m.policyEvaluation.decision.decisionId,
    requestId: m.request.requestId,
    intent: m.intent,
    riskAssessment: m.riskAssessment,
    facts: m.policyFacts,
    policy: m.policy,
    decidedAt: m.policyEvaluation.decision.decidedAt,
  });
  if (!m.plan || !m.envelope) throw new Error("EXPECTED_VALIDATED_FIXTURE");
  m.envelope = createExecutionEnvelope({
    plan: m.plan,
    intentHash: hashCanonical(m.intent),
    riskConfigHash: hashCanonical(m.riskConfig),
    walletPolicyHash: m.walletPolicyHash,
    executionNonce: m.envelope.executionNonce,
    expiresAt: m.envelope.expiresAt,
  });
  fixture.candidate.capsule = createDecisionCapsule(m);
  fixture.trusted = structuredClone(m);
  return fixture;
}

describe("pre-execution verifier independent checks", () => {
  it("accepts the pinned synthetic proposal without granting execution", async () => {
    const fixture = await createDemoProofFixture();
    expect(verifyPreExecution(fixture)).toEqual({ ok: true, reasonCodes: [], executionAuthorized: false });
  });

  it("requires evidence references to resolve even when candidate and server pin agree", async () => {
    const fixture = await assembleFixture(m => {
      m.evidence = m.evidence.slice(0, 1);
      m.provenance = m.provenance.slice(0, 1);
    });
    expect(verifyPreExecution(fixture)).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining(["EVIDENCE_REFERENCE_MISSING"]) });
  });

  it("requires an evidence role to have the expected kind", async () => {
    const fixture = await assembleFixture(m => {
      const price = m.evidence.find(e => e.evidenceId === m.riskFacts.evidenceIds.price)!;
      price.kind = "balance";
    });
    expect(verifyPreExecution(fixture)).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining(["EVIDENCE_KIND_MISMATCH"]) });
  });

  it("requires the referenced quote evidence to commit to the quote being checked", async () => {
    const fixture = await assembleFixture(m => {
      const quote = m.evidence.find(e => e.evidenceId === m.riskFacts.evidenceIds.quote)!;
      quote.valueHash = hashCanonical({ unrelated: "quote" });
      m.provenance.find(p => p.evidenceId === quote.evidenceId)!.contentHash = quote.valueHash;
    });
    expect(verifyPreExecution(fixture)).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining(["QUOTE_EVIDENCE_MISMATCH"]) });
  });

  it.each([
    ["raw amount", (m: DecisionMaterial) => { m.riskFacts.amountInRaw = "1"; }, "AMOUNT_FACTS_MISMATCH"],
    ["USD amount", (m: DecisionMaterial) => { m.riskFacts.transactionUsd = "1"; }, "RISK_POLICY_FACTS_MISMATCH"],
    ["native balance", (m: DecisionMaterial) => { m.riskFacts.nativeBalanceRaw = "2000000000000000000"; }, "RISK_POLICY_FACTS_MISMATCH"],
    ["quote time", (m: DecisionMaterial) => { m.riskFacts.quoteObservedAt = "2026-09-12T23:59:56.000Z"; }, "QUOTE_FACTS_MISMATCH"],
    ["policy slippage", (m: DecisionMaterial) => { m.policyFacts.slippageBps = 1; }, "POLICY_TARGET_FACTS_MISMATCH"],
  ] as const)("rejects internally inconsistent %s despite valid hashes", async (_name, mutate, reason) => {
    const fixture = await assembleFixture(mutate);
    const result = verifyPreExecution(fixture);
    expect(result).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining([reason]), executionAuthorized: false });
    expect(result.reasonCodes).not.toContain("CAPSULE_HASH_MISMATCH");
    expect(result.reasonCodes).not.toContain("TRUSTED_CAPSULE_MISMATCH");
  });

  it.each([
    ["price", (m: DecisionMaterial) => { m.riskConfig.maxPriceAgeSeconds = 31; }, "RISK_PRICE_TOO_OLD"],
    ["quote", (m: DecisionMaterial) => { m.riskConfig.maxQuoteAgeSeconds = 6; }, "RISK_QUOTE_TOO_OLD"],
    ["policy age", (m: DecisionMaterial) => {
      for (const rule of m.policy.rules) {
        if (rule.type === "max_data_age_seconds" && rule.evidenceKind === "price") rule.maxAgeSeconds = 31;
      }
    }, "POLICY_EVIDENCE_TOO_OLD"],
  ] as const)("expires %s freshness at verification time before the explicit TTL", async (_name, mutate, reason) => {
    const fixture = await assembleFixture(mutate);
    expect(verifyPreExecution(fixture).ok).toBe(true);
    fixture.options.now = "2026-09-13T00:00:02.000Z";
    expect(Date.parse(fixture.options.now)).toBeLessThan(Date.parse(fixture.candidate.capsule.decisionExpiresAt));
    const result = verifyPreExecution(fixture);
    expect(result).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining([reason]), executionAuthorized: false });
    expect(result.reasonCodes).not.toContain("EXPIRED_CAPSULE");
  });

  it("returns a stable denial if schema-valid request text exceeds origin extraction bounds", async () => {
    const fixture = await assembleFixture(m => {
      m.request.text = `Swap ${Array.from({length: 11}, (_, i) => `${i + 1} USDC`).join(", ")} to MON at 1% slippage.`;
    });
    expect(() => verifyPreExecution(fixture)).not.toThrow();
    expect(verifyPreExecution(fixture)).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining(["REQUEST_ORIGIN_INVALID"]) });
  });

  it("never authorizes execution even with all caller options set to ready", async () => {
    const fixture = await createDemoProofFixture();
    fixture.options = { ...fixture.options, mode: "execution", autonomyState: "RESTRICTED_EXECUTION", nonceStatus: "UNUSED", walletPolicyStatus: "MATCHED", budgetStatus: "RESERVED" };
    expect(verifyPreExecution(fixture)).toMatchObject({ ok: false, reasonCodes: expect.arrayContaining(["UNATTESTED_CAPSULE", "EXECUTION_NOT_IMPLEMENTED"]), executionAuthorized: false });
  });
});
