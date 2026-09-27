import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

import type { ExecutionNonceStore } from "../../domain/execution-envelope";

const NonceSchema = z.string().uuid();

/** Durable, atomic single use; no expiry cleanup can make an old nonce reusable. */
export class SqliteExecutionNonceStore implements ExecutionNonceStore {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.#database = new DatabaseSync(path);
    this.#database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS consumed_execution_nonces (
        nonce TEXT PRIMARY KEY
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS execution_nonces_no_update
      BEFORE UPDATE ON consumed_execution_nonces BEGIN
        SELECT RAISE(ABORT, 'EXECUTION_NONCES_ARE_APPEND_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS execution_nonces_no_delete
      BEFORE DELETE ON consumed_execution_nonces BEGIN
        SELECT RAISE(ABORT, 'EXECUTION_NONCES_ARE_APPEND_ONLY');
      END;
    `);
  }

  consume(nonce: string): boolean {
    if (!NonceSchema.safeParse(nonce).success) return false;
    const result = this.#database.prepare(
      "INSERT INTO consumed_execution_nonces (nonce) VALUES (?) ON CONFLICT(nonce) DO NOTHING",
    ).run(nonce.toLowerCase());
    return result.changes === 1;
  }

  has(nonce: string): boolean {
    // Invalid input is conservatively unavailable, never a reusable authorization.
    if (!NonceSchema.safeParse(nonce).success) return true;
    return this.#database.prepare("SELECT nonce FROM consumed_execution_nonces WHERE nonce = ?")
      .get(nonce.toLowerCase()) !== undefined;
  }

  isConsumed(nonce: string): boolean {
    return this.has(nonce);
  }

  close(): void {
    this.#database.close();
  }
}
