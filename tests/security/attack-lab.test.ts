import { describe, expect, it } from "vitest";

import { listAttackCases, runAttackCase, runAttackSuite } from "../../src/demo/attack-lab";

describe("offline adversarial attack lab", () => {
  const catalog = listAttackCases();

  it("has distinct malicious fixtures and ten independently built legitimate amounts", () => {
    expect(catalog.filter((item) => item.expected === "DENY").length).toBeGreaterThanOrEqual(30);
    expect(catalog.filter((item) => item.expected === "ALLOW").length).toBeGreaterThanOrEqual(10);
    expect(new Set(catalog.map((item) => item.id)).size).toBe(catalog.length);
  });

  it.each(catalog)("$id reaches the intended verdict and boundary", async ({ id, expected }) => {
    const result = await runAttackCase(id);
    expect(result.observed, JSON.stringify(result)).toBe(expected);
    expect(result.passed, JSON.stringify(result)).toBe(true);
    expect(result.executionAuthorized).toBe(false);
    expect(result.walletReached).toBe(false);
    expect(result.evidenceMode).toBe("OFFLINE_FIXTURE");
    expect(result.resultHash).toMatch(/^0x[0-9a-f]{64}$/);
    if (expected === "DENY") expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  it("rejects arbitrary case IDs instead of accepting client-supplied attack code", async () => {
    await expect(runAttackCase("../.env.local")).rejects.toThrow("ATTACK_CASE_NOT_FOUND");
  });

  it("does not let a previous mutation poison a pristine legitimate fixture", async () => {
    const before = await runAttackCase("benign-20-usdc");
    await runAttackCase("plan-rehashed-resealed");
    const after = await runAttackCase("benign-20-usdc");
    expect(after).toEqual(before);
  });

  it("never exposes a synthetic upstream failure body", async () => {
    const result = await runAttackCase("proposal-provider-outage");
    expect(JSON.stringify(result)).not.toContain("FIXTURE_UPSTREAM_BODY_MUST_NOT_ESCAPE");
    expect(result.reasonCodes).toContain("PROVIDER_ERROR");
  });

  it("repeats every fixed-clock input 100 times and reports honest fixture denominators", async () => {
    const summary = await runAttackSuite();
    expect(summary.allPassed).toBe(true);
    expect(summary.falseAllowCount).toBe(0);
    expect(summary.falseDenyCount).toBe(0);
    expect(summary.attackBlockedRate).toBe(1);
    expect(summary.benignCompletionRate).toBe(1);
    expect(summary.repeatCount).toBe(100);
    expect(summary.deterministicComparisonCount).toBe(summary.caseCount * 99);
    expect(summary.deterministicReplayMatchRate).toBe(1);
    expect(summary.denominatorDefinitions.attackBlockedRate).toContain("does not measure unseen attacks");
    expect(summary.denominatorDefinitions.unsafeExecutionCount).toContain("structurally zero");
  }, 600_000); // 5,100 complete fixture evaluations; keep every replay assertion.
});
