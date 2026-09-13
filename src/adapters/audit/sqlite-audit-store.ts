import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  computeAuditRecordHash,
  parseAndVerifyAuditChain,
  type AuditStore,
  type NewAuditRecord,
} from "../../application/audit-store";
import { AuditRecordSchema, type AuditRecord } from "../../domain/schemas";

interface StoredRow {
  record_json: string;
}

export class SqliteAuditStore implements AuditStore {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.#database = new DatabaseSync(path);
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS audit_records (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id TEXT NOT NULL UNIQUE,
        request_id TEXT NOT NULL UNIQUE,
        record_hash TEXT NOT NULL UNIQUE,
        previous_record_hash TEXT,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS audit_records_no_update
      BEFORE UPDATE ON audit_records BEGIN
        SELECT RAISE(ABORT, 'AUDIT_RECORDS_ARE_APPEND_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS audit_records_no_delete
      BEFORE DELETE ON audit_records BEGIN
        SELECT RAISE(ABORT, 'AUDIT_RECORDS_ARE_APPEND_ONLY');
      END;
    `);
  }

  append(material: NewAuditRecord): AuditRecord {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.#database
        .prepare("SELECT record_hash FROM audit_records ORDER BY sequence DESC LIMIT 1")
        .get() as { record_hash: string } | undefined;
      const unsigned = AuditRecordSchema.parse({
        ...material,
        previousRecordHash: prior?.record_hash ?? null,
        recordHash: `0x${"00".repeat(32)}`,
      });
      const record = AuditRecordSchema.parse({ ...unsigned, recordHash: computeAuditRecordHash(unsigned) });
      this.#database
        .prepare(`
          INSERT INTO audit_records (
            audit_id, request_id, record_hash, previous_record_hash, created_at, record_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          record.auditId,
          record.request.requestId,
          record.recordHash,
          record.previousRecordHash,
          record.createdAt,
          JSON.stringify(record),
        );
      this.#database.exec("COMMIT");
      return record;
    } catch (error: unknown) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  list(): readonly AuditRecord[] {
    const rows = this.#database
      .prepare("SELECT record_json FROM audit_records ORDER BY sequence ASC")
      .all() as unknown as StoredRow[];
    return rows.map((row) => AuditRecordSchema.parse(JSON.parse(row.record_json)));
  }

  verifyChain(): boolean {
    try {
      parseAndVerifyAuditChain(this.list());
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.#database.close();
  }
}
