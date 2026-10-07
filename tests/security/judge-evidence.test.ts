import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildJudgeEvidencePack, verifyJudgeEvidencePack } from "../../src/application/judge-evidence";
import { computeAuditRecordHash, parseAndVerifyAuditChain } from "../../src/application/audit-store";
import { replayDecisionProof } from "../../src/application/replay-decision-proof";
import { listAttackCases } from "../../src/demo/attack-lab";
import { DEMO_NOW } from "../../src/demo/demo-template";
import { createDecisionCapsule, DecisionMaterialSchema } from "../../src/domain/decision-capsule";
import { hashCanonical } from "../../src/domain/hash";
import { computeJudgeEvidenceHash, JudgeEvidencePackSchema, type JudgeEvidencePack } from "../../src/domain/judge-evidence";

const CANARY = "SYNTHETIC_JUDGE_SECRET_MUST_NOT_ESCAPE";
let baseline: JudgeEvidencePack;

beforeAll(async () => { baseline = await buildJudgeEvidencePack(); }, 20_000);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function fresh(): JudgeEvidencePack { return structuredClone(baseline); }
function reseal(pack: JudgeEvidencePack): JudgeEvidencePack {
  pack.packHash = computeJudgeEvidenceHash(pack);
  return pack;
}
function rechain(pack: JudgeEvidencePack): JudgeEvidencePack {
  let previous: string | null = null;
  for (const scenario of pack.scenarios) {
    scenario.audit.previousRecordHash = previous;
    scenario.audit.recordHash = computeAuditRecordHash(scenario.audit);
    previous = scenario.audit.recordHash;
  }
  return reseal(pack);
}
function resealAttack(pack: JudgeEvidencePack, index = 0): void {
  const item = pack.attackResults[index]!;
  const { resultHash: _hash, ...body } = item;
  item.resultHash = hashCanonical(body);
}

describe("distributable judge evidence trust boundary", () => {
  it("rebuilds the exact fixture catalog, audits and one-pass evidence independently", async () => {
    expect(JudgeEvidencePackSchema.safeParse(baseline).success).toBe(true);
    expect(baseline.attackResults.map(item => item.id)).toEqual(listAttackCases().map(item => item.id));
    expect(baseline.attackResults).toHaveLength(51);
    expect(baseline.metrics).toMatchObject({ repeatCount: 1, caseCount: 51, maliciousCaseCount: 41, benignCaseCount: 10, falseAllowCount: 0, falseDenyCount: 0 });
    const verified = await verifyJudgeEvidencePack(fresh());
    expect(verified).toMatchObject({ status: "VERIFIED", reasonCodes: [], packHash: baseline.packHash, referencePackHash: baseline.packHash, executionAuthorized: false });
    expect(verified.meaning).toContain("not authenticated provenance");
  });

  it("preserves a legitimate injection rejection without inventing a capsule", async () => {
    const injection = baseline.scenarios.find(item => item.id === "denied-prompt-injection")!;
    expect(injection).toMatchObject({ status: "denied", stoppedAt: "intent" });
    expect(injection.audit.decisionCapsule).toBeUndefined();
    expect(injection.audit.decisionMaterialJson).toBeUndefined();
    expect(injection.audit.transactionPlan).toBeNull();
    const overLimit = baseline.scenarios.find(item => item.id === "denied-over-limit")!;
    expect(overLimit.audit.decisionCapsule?.verdict).toBe("DENY");
    expect(overLimit.audit.transactionPlan).toBeNull();
    expect((await verifyJudgeEvidencePack(fresh())).status).toBe("VERIFIED");
  });

  it.each([
    ["root", (pack: JudgeEvidencePack) => { Object.assign(pack, { trusted: { skipVerification: true } }); }],
    ["capabilities", (pack: JudgeEvidencePack) => { Object.assign(pack.capabilities, { walletPrivateKey: CANARY }); }],
    ["audit", (pack: JudgeEvidencePack) => { Object.assign(pack.scenarios[0]!.audit, { databasePath: CANARY }); }],
    ["metrics", (pack: JudgeEvidencePack) => { Object.assign(pack.metrics, { deterministicReplayMatchRate: 1 }); }],
    ["attack", (pack: JudgeEvidencePack) => { Object.assign(pack.attackResults[0]!, { expectedAuthority: CANARY }); }],
  ] as const)("rejects unknown fields at the %s boundary", async (_label, mutate) => {
    const pack = fresh();
    mutate(pack);
    const result = await verifyJudgeEvidencePack(reseal(pack));
    expect(result).toMatchObject({ status: "REJECTED", reasonCodes: ["INVALID_JUDGE_EVIDENCE_SCHEMA"] });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("rejects raw corruption before trusting package hashes", async () => {
    const pack = fresh();
    pack.metrics.passedCaseCount = 0;
    const result = await verifyJudgeEvidencePack(pack);
    expect(result).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_EVIDENCE_HASH_MISMATCH", "JUDGE_METRICS_MISMATCH"]) });
  });

  it("rejects a changed audit mirror even after every audit and package hash is regenerated", async () => {
    const pack = fresh();
    pack.scenarios[0]!.audit.parsedIntent!.amountIn = "999";
    rechain(pack);
    expect(() => parseAndVerifyAuditChain(pack.scenarios.map(item => item.audit))).not.toThrow();
    expect(computeJudgeEvidenceHash(pack)).toBe(pack.packHash);
    const result = await verifyJudgeEvidencePack(pack);
    expect(result).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_SCENARIO_REFERENCE_MISMATCH", "JUDGE_REFERENCE_MISMATCH"]) });
    expect(result.reasonCodes).not.toContain("JUDGE_AUDIT_CHAIN_INVALID");
  });

  it("rejects a self-consistent forged material, capsule and full audit chain that historical replay alone accepts", async () => {
    const pack = fresh();
    const record = pack.scenarios[0]!.audit;
    const material = DecisionMaterialSchema.parse(JSON.parse(record.decisionMaterialJson!));
    material.request.userId = "forged-fixture-owner";
    record.request = structuredClone(material.request);
    record.decisionMaterialJson = JSON.stringify(material);
    record.decisionCapsule = createDecisionCapsule(material);
    const createdEvent = record.events.find(event => event.type === "capsule.created")!;
    createdEvent.payloadHash = hashCanonical(record.decisionCapsule);
    rechain(pack);
    expect(replayDecisionProof(record, { now: DEMO_NOW, mode: "proposal", autonomyState: "PROPOSE_ONLY", nonceStatus: "UNUSED", walletPolicyStatus: "NOT_CONFIGURED", budgetStatus: "NOT_RESERVED" }).ok).toBe(true);
    const result = await verifyJudgeEvidencePack(pack);
    expect(result).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_SCENARIO_REFERENCE_MISMATCH", "JUDGE_REFERENCE_MISMATCH"]) });
  });

  it.each([
    ["missing", (pack: JudgeEvidencePack) => { pack.attackResults.pop(); }],
    ["duplicate", (pack: JudgeEvidencePack) => { pack.attackResults[1] = structuredClone(pack.attackResults[0]!); }],
    ["reordered", (pack: JudgeEvidencePack) => { pack.attackResults.reverse(); }],
    ["relabelled", (pack: JudgeEvidencePack) => { pack.attackResults[0]!.id = "substituted-case"; resealAttack(pack); }],
  ] as const)("rejects a %s case catalog after resealing", async (_label, mutate) => {
    const pack = fresh();
    mutate(pack);
    expect(await verifyJudgeEvidencePack(reseal(pack))).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_ATTACK_REFERENCE_MISMATCH"]) });
  });

  it.each([
    ["expected", (pack: JudgeEvidencePack) => { pack.attackResults[0]!.expected = "ALLOW"; }],
    ["observed", (pack: JudgeEvidencePack) => { pack.attackResults[0]!.observed = "ALLOW"; }],
    ["passed", (pack: JudgeEvidencePack) => { pack.attackResults[0]!.passed = false; }],
    ["reasons", (pack: JudgeEvidencePack) => { pack.attackResults[0]!.reasonCodes = ["FAKE_GENERIC_DENIAL"]; }],
    ["mutually consistent verdicts", (pack: JudgeEvidencePack) => { Object.assign(pack.attackResults[0]!, { expected: "ALLOW", observed: "ALLOW", passed: true, reasonCodes: [] }); }],
  ] as const)("does not trust altered %s or a replacement case hash", async (_label, mutate) => {
    const pack = fresh();
    mutate(pack);
    resealAttack(pack);
    expect(await verifyJudgeEvidencePack(reseal(pack))).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_ATTACK_REFERENCE_MISMATCH"]) });
  });

  it("does not trust replacement metrics, catalog commitments or fixed time", async () => {
    const pack = fresh();
    pack.metrics.passedCaseCount = 0;
    pack.catalogHash = hashCanonical({ attackerCatalog: true });
    pack.fixtureTime = "2026-09-18T00:00:00.000Z";
    expect(await verifyJudgeEvidencePack(reseal(pack))).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_METRICS_MISMATCH", "JUDGE_CATALOG_MISMATCH", "JUDGE_REFERENCE_MISMATCH"]) });
  });

  it("rejects empty or substituted scenario chains even when local chain validation succeeds", async () => {
    const empty = fresh();
    empty.scenarios = [];
    expect(parseAndVerifyAuditChain([])).toEqual([]);
    expect((await verifyJudgeEvidencePack(reseal(empty))).reasonCodes).toContain("INVALID_JUDGE_EVIDENCE_SCHEMA");
    const duplicate = fresh();
    duplicate.scenarios[1] = structuredClone(duplicate.scenarios[0]!);
    rechain(duplicate);
    expect(() => parseAndVerifyAuditChain(duplicate.scenarios.map(item => item.audit))).not.toThrow();
    expect((await verifyJudgeEvidencePack(duplicate)).reasonCodes).toContain("JUDGE_SCENARIO_REFERENCE_MISMATCH");
  });

  it("reports broken audit links even if the outer pack is resealed", async () => {
    const pack = fresh();
    pack.scenarios[1]!.audit.previousRecordHash = null;
    pack.scenarios[1]!.audit.recordHash = computeAuditRecordHash(pack.scenarios[1]!.audit);
    expect(await verifyJudgeEvidencePack(reseal(pack))).toMatchObject({ status: "REJECTED", reasonCodes: expect.arrayContaining(["JUDGE_AUDIT_CHAIN_INVALID"]) });
  });

  it("builds and verifies without fetch or using credential environment values", async () => {
    const fetchStub = vi.fn(() => { throw new Error("UNEXPECTED_NETWORK_CALL"); });
    vi.stubGlobal("fetch", fetchStub);
    for (const name of ["PRIVY_APP_ID", "PRIVY_APP_SECRET", "PRIVY_AUTHORIZATION_PRIVATE_KEY", "PRIVY_WALLET_ID", "ALICE_GUARD_WALLET_MODE"]) vi.stubEnv(name, CANARY);
    const built = await buildJudgeEvidencePack();
    expect(built).toEqual(baseline);
    const result = await verifyJudgeEvidencePack(built);
    expect(result.status).toBe("VERIFIED");
    expect(fetchStub).not.toHaveBeenCalled();
    expect(JSON.stringify({ built, result })).not.toContain(CANARY);
    expect(JSON.stringify(built)).not.toMatch(/C:\\\\Users|"appSecret"|"privateKey"|"databasePath"/);
  }, 20_000); // Rebuild and independent reference verification both run all 51 cases.

  it("rejects malformed material snapshots without echoing their content", async () => {
    const pack = fresh();
    pack.scenarios[0]!.audit.decisionMaterialJson = `{"secret":"${CANARY}",`;
    rechain(pack);
    const result = await verifyJudgeEvidencePack(pack);
    expect(result.status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("JUDGE_POSITIVE_REPLAY_FAILED");
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });
});
