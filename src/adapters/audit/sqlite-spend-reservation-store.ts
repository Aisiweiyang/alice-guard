import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  ReserveSpendInputSchema,
  SpendReservationSchema,
  type ReserveSpendInput,
  type ReserveSpendResult,
  type SpendReservation,
  type SpendReservationStore,
} from "../../application/spend-reservation-store";
import { fromScaledInteger, toScaledInteger } from "../../domain/canonicalize";
import { hashCanonical } from "../../domain/hash";

const USD_SCALE = 6;

interface ReservationRow {
  reservation_id: string;
  request_id: string;
  wallet_address: string;
  amount_microusd: string;
  status: SpendReservation["status"];
  created_at: string;
  updated_at: string;
  expires_at: string;
}
interface EventRow {
  record_json: string;
}

type Transition = "commit" | "release" | "reconciliation_required" | "expire";

function parseRow(row: ReservationRow): SpendReservation {
  return SpendReservationSchema.parse({
    reservationId: row.reservation_id,
    requestId: row.request_id,
    walletAddress: row.wallet_address,
    amountUsd: fromScaledInteger(BigInt(row.amount_microusd), USD_SCALE),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  });
}

export class SqliteSpendReservationStore implements SpendReservationStore {
  readonly #database: DatabaseSync;
  readonly #nextId: () => string;

  constructor(path: string, nextId: () => string = randomUUID) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.#database = new DatabaseSync(path);
    this.#nextId = nextId;
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS spend_reservations (
        reservation_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        wallet_address TEXT NOT NULL,
        amount_microusd TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('reserved','committed','released','expired','reconciliation_required')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS spend_reservations_wallet_window
        ON spend_reservations(wallet_address, created_at, status);
      CREATE TABLE IF NOT EXISTS spend_reservation_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        reservation_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        record_hash TEXT NOT NULL UNIQUE,
        previous_record_hash TEXT,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        FOREIGN KEY(reservation_id) REFERENCES spend_reservations(reservation_id)
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS spend_events_no_update
      BEFORE UPDATE ON spend_reservation_events BEGIN
        SELECT RAISE(ABORT, 'SPEND_EVENTS_ARE_APPEND_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS spend_events_no_delete
      BEFORE DELETE ON spend_reservation_events BEGIN
        SELECT RAISE(ABORT, 'SPEND_EVENTS_ARE_APPEND_ONLY');
      END;
    `);
  }

  reserve(unknownInput: ReserveSpendInput): ReserveSpendResult {
    const parsed = ReserveSpendInputSchema.safeParse(unknownInput);
    if (!parsed.success) return { ok: false, reason: "RESERVATION_INPUT_INVALID" };
    const input = parsed.data;
    const amount = toScaledInteger(input.amountUsd, USD_SCALE);
    const transactionLimit = toScaledInteger(input.maxTransactionUsd, USD_SCALE);
    const rollingLimit = toScaledInteger(input.maxRollingUsd, USD_SCALE);
    if (amount === 0n || amount > transactionLimit) return { ok: false, reason: "TRANSACTION_LIMIT_EXCEEDED" };

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database
        .prepare("SELECT * FROM spend_reservations WHERE request_id = ?")
        .get(input.requestId) as ReservationRow | undefined;
      if (existing) {
        const reservation = parseRow(existing);
        this.#database.exec("COMMIT");
        return reservation.walletAddress.toLowerCase() === input.walletAddress.toLowerCase() && reservation.amountUsd === input.amountUsd
          ? { ok: true, reservation, idempotentReplay: true }
          : { ok: false, reason: "REQUEST_RESERVATION_CONFLICT" };
      }

      this.#expireReservedRows(input.walletAddress, input.now);
      const windowStart = new Date(Date.parse(input.now) - input.windowSeconds * 1_000).toISOString();
      const active = this.#database
        .prepare(`
          SELECT amount_microusd FROM spend_reservations
          WHERE lower(wallet_address) = lower(?)
            AND created_at >= ?
            AND status IN ('reserved','committed','reconciliation_required')
        `)
        .all(input.walletAddress, windowStart) as unknown as { amount_microusd: string }[];
      const alreadyCounted = active.reduce((total, row) => total + BigInt(row.amount_microusd), 0n);
      if (alreadyCounted + amount > rollingLimit) {
        this.#database.exec("ROLLBACK");
        return { ok: false, reason: "ROLLING_LIMIT_EXCEEDED" };
      }

      const reservation = SpendReservationSchema.parse({
        reservationId: this.#nextId(),
        requestId: input.requestId,
        walletAddress: input.walletAddress,
        amountUsd: input.amountUsd,
        status: "reserved",
        createdAt: input.now,
        updatedAt: input.now,
        expiresAt: input.expiresAt,
      });
      this.#database.prepare(`
        INSERT INTO spend_reservations (
          reservation_id, request_id, wallet_address, amount_microusd, status, created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reservation.reservationId,
        reservation.requestId,
        reservation.walletAddress,
        amount.toString(),
        reservation.status,
        reservation.createdAt,
        reservation.updatedAt,
        reservation.expiresAt,
      );
      this.#appendEvent(reservation, "reserved", "Spend reserved before wallet authorization.");
      this.#database.exec("COMMIT");
      return { ok: true, reservation, idempotentReplay: false };
    } catch (error: unknown) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  commit(reservationId: string, now: string): SpendReservation {
    return this.#transition(reservationId, now, "commit");
  }

  release(reservationId: string, now: string): SpendReservation {
    return this.#transition(reservationId, now, "release");
  }

  requireReconciliation(reservationId: string, now: string): SpendReservation {
    return this.#transition(reservationId, now, "reconciliation_required");
  }

  expire(reservationId: string, now: string): SpendReservation {
    return this.#transition(reservationId, now, "expire");
  }

  get(reservationId: string): SpendReservation | null {
    const row = this.#database
      .prepare("SELECT * FROM spend_reservations WHERE reservation_id = ?")
      .get(reservationId) as ReservationRow | undefined;
    return row ? parseRow(row) : null;
  }

  list(): readonly SpendReservation[] {
    const rows = this.#database
      .prepare("SELECT * FROM spend_reservations ORDER BY created_at, reservation_id")
      .all() as unknown as ReservationRow[];
    return rows.map(parseRow);
  }

  verifyEventChain(): boolean {
    try {
      const rows = this.#database
        .prepare("SELECT record_json FROM spend_reservation_events ORDER BY sequence")
        .all() as unknown as EventRow[];
      let prior: string | null = null;
      for (const row of rows) {
        const event = JSON.parse(row.record_json) as Record<string, unknown>;
        const recordHash = event["recordHash"];
        const previousRecordHash = event["previousRecordHash"];
        const material = { ...event };
        delete material["recordHash"];
        if (previousRecordHash !== prior || recordHash !== hashCanonical(material)) return false;
        prior = String(recordHash);
      }
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.#database.close();
  }

  #expireReservedRows(walletAddress: string, now: string): void {
    const rows = this.#database.prepare(`
      SELECT * FROM spend_reservations
      WHERE lower(wallet_address) = lower(?) AND status = 'reserved' AND expires_at <= ?
    `).all(walletAddress, now) as unknown as ReservationRow[];
    for (const row of rows) {
      this.#database.prepare("UPDATE spend_reservations SET status = 'expired', updated_at = ? WHERE reservation_id = ?")
        .run(now, row.reservation_id);
      this.#appendEvent(parseRow({ ...row, status: "expired", updated_at: now }), "expired", "Expired reservation released before a new budget check.");
    }
  }

  #transition(reservationId: string, now: string, transition: Transition): SpendReservation {
    if (!zIso(now) || !/^[0-9a-f-]{36}$/i.test(reservationId)) throw new Error("RESERVATION_TRANSITION_INPUT_INVALID");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database.prepare("SELECT * FROM spend_reservations WHERE reservation_id = ?").get(reservationId) as ReservationRow | undefined;
      if (!row) throw new Error("RESERVATION_NOT_FOUND");
      if (row.status !== "reserved") throw new Error(`RESERVATION_TRANSITION_DENIED:${row.status}`);
      if (transition === "expire" && Date.parse(now) < Date.parse(row.expires_at)) throw new Error("RESERVATION_NOT_EXPIRED");
      const nextStatus: SpendReservation["status"] = transition === "commit"
        ? "committed"
        : transition === "release"
          ? "released"
          : transition === "expire"
            ? "expired"
            : "reconciliation_required";
      this.#database.prepare("UPDATE spend_reservations SET status = ?, updated_at = ? WHERE reservation_id = ?")
        .run(nextStatus, now, reservationId);
      const reservation = parseRow({ ...row, status: nextStatus, updated_at: now });
      this.#appendEvent(reservation, nextStatus, `Reservation entered ${nextStatus}.`);
      this.#database.exec("COMMIT");
      return reservation;
    } catch (error: unknown) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #appendEvent(reservation: SpendReservation, type: SpendReservation["status"], safeSummary: string): void {
    const prior = this.#database.prepare("SELECT record_hash FROM spend_reservation_events ORDER BY sequence DESC LIMIT 1")
      .get() as { record_hash: string } | undefined;
    const material = {
      eventId: this.#nextId(),
      reservationId: reservation.reservationId,
      requestId: reservation.requestId,
      walletAddress: reservation.walletAddress,
      amountUsd: reservation.amountUsd,
      eventType: type,
      occurredAt: reservation.updatedAt,
      safeSummary,
      previousRecordHash: prior?.record_hash ?? null,
    };
    const record = { ...material, recordHash: hashCanonical(material) };
    this.#database.prepare(`
      INSERT INTO spend_reservation_events (
        event_id, reservation_id, request_id, event_type, record_hash, previous_record_hash, created_at, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.eventId,
      record.reservationId,
      record.requestId,
      record.eventType,
      record.recordHash,
      record.previousRecordHash,
      record.occurredAt,
      JSON.stringify(record),
    );
  }
}

function zIso(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value);
}
