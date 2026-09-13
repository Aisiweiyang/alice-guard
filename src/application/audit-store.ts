import { AuditRecordSchema, type AuditRecord } from "../domain/schemas";
import { hashCanonical } from "../domain/hash";

export type NewAuditRecord = Omit<AuditRecord, "previousRecordHash" | "recordHash">;

export interface AuditStore {
  append(record: NewAuditRecord): AuditRecord;
  list(): readonly AuditRecord[];
  verifyChain(): boolean;
}

export function auditRecordHashMaterial(record: AuditRecord): unknown {
  const { recordHash: _recordHash, ...material } = record;
  return material;
}

export function computeAuditRecordHash(record: AuditRecord): `0x${string}` {
  return hashCanonical(auditRecordHashMaterial(record));
}

export function parseAndVerifyAuditChain(records: readonly unknown[]): readonly AuditRecord[] {
  let previousHash: `0x${string}` | null = null;
  return records.map((candidate) => {
    const record = AuditRecordSchema.parse(candidate);
    if (record.previousRecordHash !== previousHash || record.recordHash !== computeAuditRecordHash(record)) {
      throw new Error(`AUDIT_CHAIN_INVALID:${record.auditId}`);
    }
    previousHash = record.recordHash;
    return record;
  });
}
