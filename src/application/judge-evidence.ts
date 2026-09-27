import { SqliteAuditStore } from "../adapters/audit/sqlite-audit-store";
import { createDemoDependencies, DEMO_NOW, DEMO_SCENARIOS } from "../demo/demo-template";
import { listAttackCases, runAttackCase } from "../demo/attack-lab";
import { computeJudgeEvidenceHash, JUDGE_EVIDENCE_LIMITATION, JudgeEvidencePackSchema, type JudgeEvidencePack } from "../domain/judge-evidence";
import { hashCanonical } from "../domain/hash";
import { parseAndVerifyAuditChain } from "./audit-store";
import { runDemoRequest } from "./demo-orchestrator";
import { replayDecisionProof } from "./replay-decision-proof";

/** Builds ONLY bundled synthetic fixtures. No DB path, env, user data, or provider input. */
export async function buildJudgeEvidencePack(): Promise<JudgeEvidencePack> {
  const store = new SqliteAuditStore(":memory:");
  const scenarios: JudgeEvidencePack["scenarios"] = [];
  try {
    for (const scenario of DEMO_SCENARIOS) {
      const result = await runDemoRequest(scenario.request, createDemoDependencies(scenario, store));
      scenarios.push({id: scenario.name, expectedStatus: scenario.name === "allowed-small-swap" ? "prepared" : "denied",
        status: result.status, stoppedAt: result.stage, reasonCodes: result.reasonCodes, audit: result.audit});
    }
    if (!store.verifyChain()) throw new Error("JUDGE_AUDIT_BUILD_FAILED");
  } finally {store.close();}
  const catalog = listAttackCases();
  const attackResults = [];
  for (const item of catalog) attackResults.push(await runAttackCase(item.id));
  const malicious = attackResults.filter(r => r.expected === "DENY");
  const benign = attackResults.filter(r => r.expected === "ALLOW");
  if (attackResults.some(r => !r.passed) || scenarios.some(s => s.status !== s.expectedStatus)) throw new Error("JUDGE_FIXTURE_ASSERTION_FAILED");
  const pack = JudgeEvidencePackSchema.parse({
    schemaVersion: "alice-guard.judge-evidence.v1", fixtureSetVersion: "alice-guard.offline-fixtures.v1",
    mode: "offline-fixture", fixtureTime: DEMO_NOW, attestation: "UNATTESTED", limitation: JUDGE_EVIDENCE_LIMITATION,
    capabilities: {signing: false, broadcast: false, funding: false, executionAuthorized: false},
    catalogHash: hashCanonical(catalog), scenarios, attackResults,
    metrics: {repeatCount: 1, caseCount: attackResults.length, maliciousCaseCount: malicious.length,
      benignCaseCount: benign.length, passedCaseCount: attackResults.filter(r => r.passed).length,
      falseAllowCount: malicious.filter(r => r.observed === "ALLOW").length, falseDenyCount: benign.filter(r => r.observed === "DENY").length},
    packHash: `0x${"00".repeat(32)}`,
  });
  return JudgeEvidencePackSchema.parse({...pack, packHash: computeJudgeEvidenceHash(pack)});
}

export interface JudgeEvidenceVerification {
  schemaVersion: "alice-guard.judge-verification.v1";
  status: "VERIFIED" | "REJECTED";
  reasonCodes: string[];
  packHash: string | null;
  referencePackHash: string | null;
  executionAuthorized: false;
  meaning: string;
}

/** Rebuilds fixtures from THIS trusted checkout, never from package-provided authority. */
export async function verifyJudgeEvidencePack(input: unknown): Promise<JudgeEvidenceVerification> {
  const result: JudgeEvidenceVerification = {schemaVersion: "alice-guard.judge-verification.v1", status: "REJECTED", reasonCodes: [],
    packHash: null, referencePackHash: null, executionAuthorized: false,
    meaning: "VERIFIED means exact reproducibility against local offline fixtures, not authenticated provenance, live readiness, or execution permission."};
  try {
    const parsed = JudgeEvidencePackSchema.safeParse(input);
    if (!parsed.success) {result.reasonCodes.push("INVALID_JUDGE_EVIDENCE_SCHEMA"); return result;}
    const pack = parsed.data;
    result.packHash = pack.packHash;
    if (computeJudgeEvidenceHash(pack) !== pack.packHash) result.reasonCodes.push("JUDGE_EVIDENCE_HASH_MISMATCH");
    try {parseAndVerifyAuditChain(pack.scenarios.map(s => s.audit));}
    catch {result.reasonCodes.push("JUDGE_AUDIT_CHAIN_INVALID");}
    // IDs, count, ordering, all audit mirrors, metadata and results are compared.
    // A re-sealed, internally consistent forgery cannot replace this reference.
    const reference = await buildJudgeEvidencePack();
    result.referencePackHash = reference.packHash;
    if (hashCanonical(pack.scenarios) !== hashCanonical(reference.scenarios)) result.reasonCodes.push("JUDGE_SCENARIO_REFERENCE_MISMATCH");
    if (hashCanonical(pack.attackResults) !== hashCanonical(reference.attackResults)) result.reasonCodes.push("JUDGE_ATTACK_REFERENCE_MISMATCH");
    if (hashCanonical(pack.metrics) !== hashCanonical(reference.metrics)) result.reasonCodes.push("JUDGE_METRICS_MISMATCH");
    if (pack.catalogHash !== reference.catalogHash) result.reasonCodes.push("JUDGE_CATALOG_MISMATCH");
    if (computeJudgeEvidenceHash(pack) !== reference.packHash) result.reasonCodes.push("JUDGE_REFERENCE_MISMATCH");
    const options = {now: DEMO_NOW, mode: "proposal" as const, autonomyState: "PROPOSE_ONLY" as const,
      nonceStatus: "UNUSED" as const, walletPolicyStatus: "NOT_CONFIGURED" as const, budgetStatus: "NOT_RESERVED" as const};
    const positive = pack.scenarios.find(s => s.id === "allowed-small-swap");
    if (!positive || !replayDecisionProof(positive.audit, options).ok) result.reasonCodes.push("JUDGE_POSITIVE_REPLAY_FAILED");
    const denied = pack.scenarios.find(s => s.id === "denied-over-limit");
    if (!denied || !replayDecisionProof(denied.audit, options).reasonCodes.includes("POLICY_DENIED")) result.reasonCodes.push("JUDGE_DENIAL_REPLAY_FAILED");
    // The injection case stops before a capsule exists; exact reference covers it.
    result.status = result.reasonCodes.length === 0 ? "VERIFIED" : "REJECTED";
  } catch {result.reasonCodes.push("JUDGE_VERIFICATION_UNAVAILABLE");}
  return result;
}
