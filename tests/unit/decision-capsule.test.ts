import { describe, expect, it } from "vitest";
import { createDemoProofFixture } from "../../src/demo/proof-fixture";
import { createDecisionCapsule, computeDecisionCapsuleHash, DecisionCapsuleSchema } from "../../src/domain/decision-capsule";
import { verifyPreExecution } from "../../src/application/pre-execution-verifier";
import { computePlanHash } from "../../src/application/build-plan";

describe("decision capsule commitments", () => {
  it("is deterministic for identical complete material and strictly unattested", async () => {
    const f = await createDemoProofFixture();
    expect(createDecisionCapsule(f.trusted)).toEqual(f.candidate.capsule);
    expect(computeDecisionCapsuleHash(f.candidate.capsule)).toBe(f.candidate.capsule.capsuleHash);
    expect(verifyPreExecution(f)).toEqual({ok: true, reasonCodes: [], executionAuthorized: false});
    expect(DecisionCapsuleSchema.safeParse({...f.candidate.capsule, signature: "invented"}).success).toBe(false);
  });
  it("rejects re-sealed candidate material against an independent trusted snapshot", async () => {
    const f = await createDemoProofFixture();
    f.candidate.material.plan!.transactions[1]!.to = `0x${"99".repeat(20)}`;
    f.candidate.material.plan!.planHash = computePlanHash(f.candidate.material.plan!);
    f.candidate.capsule = createDecisionCapsule(f.candidate.material);
    const result = verifyPreExecution(f);
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain("PLAN_BINDING_MISMATCH");
    expect(f.trusted.plan!.transactions[1]!.to).not.toBe(f.candidate.material.plan!.transactions[1]!.to);
  });
  it("cannot grant execution even with claimed wallet and budget readiness", async () => {
    const f = await createDemoProofFixture();
    f.options = {...f.options, mode: "execution", autonomyState: "RESTRICTED_EXECUTION", walletPolicyStatus: "MATCHED", budgetStatus: "RESERVED"};
    expect(verifyPreExecution(f)).toMatchObject({ok: false, executionAuthorized: false});
    expect(verifyPreExecution(f).reasonCodes).toContain("UNATTESTED_CAPSULE");
  });
  it("rejects exact expiry and fail-open runtime flags", async () => {
    const f = await createDemoProofFixture();
    f.options.now = f.candidate.capsule.decisionExpiresAt;
    expect(verifyPreExecution(f).reasonCodes).toContain("EXPIRED_CAPSULE");
    expect(verifyPreExecution({...f, options: {...f.options, bypass: true}}).reasonCodes).toContain("INVALID_VERIFIER_OPTIONS");
  });
});
