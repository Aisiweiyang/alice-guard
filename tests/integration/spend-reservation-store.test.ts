import { describe, expect, it } from "vitest";

import { SqliteSpendReservationStore } from "../../src/adapters/audit/sqlite-spend-reservation-store";

const WALLET = `0x${"55".repeat(20)}`;
const NOW = "2026-09-14T00:00:00.000Z";
const EXPIRES = "2026-09-14T00:05:00.000Z";

function ids(): () => string {
  let counter = 1;
  return () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`;
}

function input(requestId: string, amountUsd: string, maxRollingUsd = "100") {
  return {
    requestId,
    walletAddress: WALLET,
    amountUsd,
    maxTransactionUsd: "100",
    maxRollingUsd,
    windowSeconds: 86_400,
    now: NOW,
    expiresAt: EXPIRES,
  };
}

describe("SQLite spend reservation store", () => {
  it("atomically prevents concurrent reservations from crossing a rolling cap", async () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const [first, second] = await Promise.all([
        Promise.resolve().then(() => store.reserve(input("00000000-0000-4000-8000-000000001001", "60"))),
        Promise.resolve().then(() => store.reserve(input("00000000-0000-4000-8000-000000001002", "60"))),
      ]);
      expect([first, second].filter((result) => result.ok)).toHaveLength(1);
      expect([first, second].filter((result) => !result.ok)).toEqual([
        expect.objectContaining({ reason: "ROLLING_LIMIT_EXCEEDED" }),
      ]);
      expect(store.verifyEventChain()).toBe(true);
    } finally {
      store.close();
    }
  });

  it("is idempotent for an identical request and rejects conflicting reuse", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const requestId = "00000000-0000-4000-8000-000000001003";
      const first = store.reserve(input(requestId, "20"));
      const replay = store.reserve(input(requestId, "20"));
      const conflict = store.reserve(input(requestId, "21"));
      expect(first).toMatchObject({ ok: true, idempotentReplay: false });
      expect(replay).toMatchObject({ ok: true, idempotentReplay: true });
      expect(conflict).toEqual({ ok: false, reason: "REQUEST_RESERVATION_CONFLICT" });
      expect(store.list()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("counts committed and uncertain outcomes, but releases known failures", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const first = store.reserve(input("00000000-0000-4000-8000-000000001004", "40"));
      const second = store.reserve(input("00000000-0000-4000-8000-000000001005", "40"));
      if (!first.ok || !second.ok) throw new Error("RESERVATION_SETUP_FAILED");
      store.commit(first.reservation.reservationId, "2026-09-14T00:00:01.000Z");
      store.release(second.reservation.reservationId, "2026-09-14T00:00:01.000Z");
      const third = store.reserve(input("00000000-0000-4000-8000-000000001006", "60"));
      expect(third.ok).toBe(true);
      if (!third.ok) return;
      store.requireReconciliation(third.reservation.reservationId, "2026-09-14T00:00:02.000Z");
      expect(() => store.release(third.reservation.reservationId, "2026-09-14T00:00:03.000Z")).toThrow(/reconciliation_required/);
      expect(store.verifyEventChain()).toBe(true);
    } finally {
      store.close();
    }
  });

  it("rejects a transaction above its individual cap before reserving", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      expect(store.reserve(input("00000000-0000-4000-8000-000000001007", "101", "1000")))
        .toEqual({ ok: false, reason: "TRANSACTION_LIMIT_EXCEEDED" });
      expect(store.list()).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});
