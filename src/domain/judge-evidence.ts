import { z } from "zod";
import { AuditRecordSchema, Bytes32Schema, IdentSchema, IsoDateTimeSchema } from "./schemas";
import { hashCanonical } from "./hash";

export const JUDGE_EVIDENCE_LIMITATION = "Fixed synthetic offline fixtures only. One pass per case, not the 100-repeat benchmark. Hashes are not signatures or source authentication. Verification requires a trusted local checkout of the same fixture implementation; no live LLM, Privy denial, transaction, or competition eligibility is proved.";
export const MAX_JUDGE_EVIDENCE_BYTES = 2 * 1024 * 1024;

export const JudgeAttackResultSchema = z.object({
  id: IdentSchema, title: z.string().min(1).max(200), category: IdentSchema,
  expected: z.enum(["ALLOW", "DENY"]), observed: z.enum(["ALLOW", "DENY"]), passed: z.boolean(),
  reasonCodes: z.array(IdentSchema).max(128), boundary: z.string().min(1).max(300), mutation: z.string().min(1).max(2000),
  executionAuthorized: z.literal(false), walletReached: z.literal(false),
  mode: z.literal("offline-attack-lab"), evidenceMode: z.literal("OFFLINE_FIXTURE"),
  capsuleHash: Bytes32Schema.nullable(), resultHash: Bytes32Schema,
}).strict();

export const JudgeScenarioSchema = z.object({
  id: z.enum(["allowed-small-swap", "denied-over-limit", "denied-prompt-injection"]),
  expectedStatus: z.enum(["prepared", "denied"]), status: z.enum(["prepared", "requires_approval", "denied"]),
  stoppedAt: z.enum(["intent", "risk", "policy", "plan"]), reasonCodes: z.array(IdentSchema).max(128),
  audit: AuditRecordSchema,
}).strict();

export const JudgeEvidencePackSchema = z.object({
  schemaVersion: z.literal("alice-guard.judge-evidence.v1"),
  fixtureSetVersion: z.literal("alice-guard.offline-fixtures.v1"),
  mode: z.literal("offline-fixture"), fixtureTime: IsoDateTimeSchema,
  attestation: z.literal("UNATTESTED"), limitation: z.literal(JUDGE_EVIDENCE_LIMITATION),
  capabilities: z.object({signing: z.literal(false), broadcast: z.literal(false), funding: z.literal(false), executionAuthorized: z.literal(false)}).strict(),
  catalogHash: Bytes32Schema,
  scenarios: z.array(JudgeScenarioSchema).length(3),
  attackResults: z.array(JudgeAttackResultSchema).min(1).max(128),
  metrics: z.object({
    repeatCount: z.literal(1), caseCount: z.number().int().min(1).max(128),
    maliciousCaseCount: z.number().int().min(1).max(128), benignCaseCount: z.number().int().min(1).max(128),
    passedCaseCount: z.number().int().min(0).max(128), falseAllowCount: z.number().int().min(0).max(128),
    falseDenyCount: z.number().int().min(0).max(128),
  }).strict(),
  packHash: Bytes32Schema,
}).strict();
export type JudgeEvidencePack = z.infer<typeof JudgeEvidencePackSchema>;
export function computeJudgeEvidenceHash(pack: JudgeEvidencePack): `0x${string}` {
  const {packHash: _hash, ...payload} = pack;
  return hashCanonical(payload);
}
