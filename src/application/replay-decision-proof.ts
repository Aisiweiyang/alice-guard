import { AuditRecordSchema } from "../domain/schemas";
import { DecisionMaterialSchema } from "../domain/decision-capsule";
import { hashCanonical } from "../domain/hash";
import { computeAuditRecordHash } from "./audit-store";
import { verifyPreExecution, type ProofVerification, type VerificationOptions } from "./pre-execution-verifier";

/** Historical local replay, not an authenticated audit or a live authorization. */
export function replayDecisionProof(input: unknown, options: VerificationOptions): ProofVerification {
  const fail = (reason: string): ProofVerification => ({ok: false, reasonCodes: [reason], executionAuthorized: false});
  try {
    const record = AuditRecordSchema.parse(input);
    if (record.recordHash !== computeAuditRecordHash(record)) return fail("AUDIT_RECORD_HASH_MISMATCH");
    if (!record.decisionCapsule || !record.decisionMaterialJson) return fail("PROOF_SNAPSHOT_UNAVAILABLE");
    const material = DecisionMaterialSchema.parse(JSON.parse(record.decisionMaterialJson));
    if (record.decisionCapsule.materialHash !== hashCanonical(material) || hashCanonical(record.request) !== hashCanonical(material.request)) return fail("PROOF_SNAPSHOT_MISMATCH");
    return verifyPreExecution({candidate: {capsule: record.decisionCapsule, material}, trusted: structuredClone(material), options});
  } catch { return fail("INVALID_PROOF_SNAPSHOT"); }
}
