import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";

import { SqliteSpendReservationStore } from "../../src/adapters/audit/sqlite-spend-reservation-store";
import type { ReserveSpendResult } from "../../src/application/spend-reservation-store";

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
  it("prevents successive reservations from crossing a rolling cap", async () => {
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
      const third = store.reserve({ ...input("00000000-0000-4000-8000-000000001006", "60"), now: "2026-09-14T00:00:01.000Z" });
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

  it.each(["commit", "release", "requireReconciliation"] as const)("does not authorize a replay after %s", (transition) => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const request = input("00000000-0000-4000-8000-000000001008", "20");
      const first = store.reserve(request);
      if (!first.ok) throw new Error("SETUP_FAILED");
      store[transition](first.reservation.reservationId, NOW);
      expect(store.reserve(request)).toEqual({ ok: false, reason: "RESERVATION_NOT_ACTIVE" });
      expect(store.list()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it.each([
    { maxRollingUsd: "1000" },
    { maxTransactionUsd: "1000" },
    { windowSeconds: 60 },
    { expiresAt: "2026-09-14T00:10:00.000Z" },
  ])("binds the complete immutable budget request: %j", (mutation) => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const request = input("00000000-0000-4000-8000-000000001009", "20");
      expect(store.reserve(request).ok).toBe(true);
      expect(store.reserve({ ...request, ...mutation })).toEqual({ ok: false, reason: "REQUEST_RESERVATION_CONFLICT" });
    } finally {
      store.close();
    }
  });

  it("normalizes decimal and timezone representations before replay comparison", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const request = input("00000000-0000-4000-8000-000000001010", "20.00");
      const first = store.reserve({ ...request, now: "2026-09-14T08:00:00+08:00", expiresAt: "2026-09-14T08:05:00+08:00" });
      expect(first).toMatchObject({ ok: true, reservation: { amountUsd: "20", createdAt: NOW, expiresAt: EXPIRES } });
      expect(store.reserve({ ...request, amountUsd: "20" })).toMatchObject({ ok: true, idempotentReplay: true });
    } finally {
      store.close();
    }
  });

  it("rejects unrepresentable USD precision safely without rounding", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      expect(store.reserve(input("00000000-0000-4000-8000-000000001011", "0.0000001")))
        .toEqual({ ok: false, reason: "RESERVATION_INPUT_INVALID" });
      expect(store.list()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("keeps uncertain outcomes reserved after expiry and outside the rolling window across restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "alice-budget-restart-"));
    const path = join(directory, "budget.sqlite");
    let store = new SqliteSpendReservationStore(path);
    try {
      const first = store.reserve(input("00000000-0000-4000-8000-000000001012", "80"));
      if (!first.ok) throw new Error("SETUP_FAILED");
      store.requireReconciliation(first.reservation.reservationId, NOW);
      store.close();
      store = new SqliteSpendReservationStore(path);
      const future = { ...input("00000000-0000-4000-8000-000000001013", "21"), now: "2026-09-16T00:00:00.000Z", expiresAt: "2026-09-16T00:05:00.000Z" };
      expect(store.reserve(future)).toEqual({ ok: false, reason: "ROLLING_LIMIT_EXCEEDED" });
      expect(() => store.expire(first.reservation.reservationId, future.now)).toThrow(/reconciliation_required/);
      expect(() => store.release(first.reservation.reservationId, future.now)).toThrow(/reconciliation_required/);
      expect(store.get(first.reservation.reservationId)?.status).toBe("reconciliation_required");
      expect(store.verifyEventChain()).toBe(true);
    } finally {
      store.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("keeps unexpired reservations counted outside the rolling window, then releases expired holds", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const first = store.reserve({ ...input("00000000-0000-4000-8000-000000001014", "80"), windowSeconds: 60 });
      if (!first.ok) throw new Error("SETUP_FAILED");
      expect(store.reserve({ ...input("00000000-0000-4000-8000-000000001015", "21"), windowSeconds: 60, now: "2026-09-14T00:02:00.000Z" }))
        .toEqual({ ok: false, reason: "ROLLING_LIMIT_EXCEEDED" });
      expect(store.reserve({ ...input("00000000-0000-4000-8000-000000001016", "100"), now: EXPIRES, expiresAt: "2026-09-14T00:10:00.000Z" }).ok).toBe(true);
      expect(store.get(first.reservation.reservationId)?.status).toBe("expired");
      expect(store.reserve({ ...input("00000000-0000-4000-8000-000000001014", "80"), windowSeconds: 60, now: EXPIRES, expiresAt: "2026-09-14T00:10:00.000Z" }).ok).toBe(false);
      expect(store.verifyEventChain()).toBe(true);
    } finally {
      store.close();
    }
  });

  it("uses commit time for rolling spend and rejects backwards or expired commits", () => {
    const store = new SqliteSpendReservationStore(":memory:", ids());
    try {
      const first = store.reserve(input("00000000-0000-4000-8000-000000001017", "80"));
      if (!first.ok) throw new Error("SETUP_FAILED");
      expect(() => store.commit(first.reservation.reservationId, "2026-09-13T23:59:59.000Z")).toThrow("RESERVATION_TIMESTAMP_REVERSED");
      expect(() => store.commit(first.reservation.reservationId, EXPIRES)).toThrow("RESERVATION_EXPIRED");
      expect(() => store.release(first.reservation.reservationId, "2026-09-14T00:00:00 INVALID Z")).toThrow("RESERVATION_TRANSITION_INPUT_INVALID");
      expect(() => store.expire(first.reservation.reservationId, NOW)).toThrow("RESERVATION_NOT_EXPIRED");
      store.commit(first.reservation.reservationId, "2026-09-14T00:04:00.000Z");
      expect(store.reserve({ ...input("00000000-0000-4000-8000-000000001018", "21"), windowSeconds: 60, now: "2026-09-14T00:04:30.000Z" }))
        .toEqual({ ok: false, reason: "ROLLING_LIMIT_EXCEEDED" });
      expect(store.reserve(input("00000000-0000-4000-8000-000000001019", "20")))
        .toEqual({ ok: false, reason: "RESERVATION_INPUT_INVALID" });
    } finally {
      store.close();
    }
  });

  it("serializes actual simultaneous writers using separate SQLite connections", async () => {
    const directory = mkdtempSync(join(tmpdir(), "alice-budget-race-"));
    const path = join(directory, "budget.sqlite");
    const initializer = new SqliteSpendReservationStore(path);
    initializer.close();
    const workers: Worker[] = [];
    try {
      const attempts = ["00000000-0000-4000-8000-000000001020", "00000000-0000-4000-8000-000000001021"].map((requestId) => {
        const worker = new Worker(`
          const { parentPort, workerData } = require('node:worker_threads');
          require('tsx/cjs');
          const { SqliteSpendReservationStore } = require(workerData.modulePath);
          const store = new SqliteSpendReservationStore(workerData.path);
          parentPort.once('message', () => {
            try { parentPort.postMessage({ result: store.reserve(workerData.input) }); }
            finally { store.close(); }
          });
          parentPort.postMessage({ ready: true });
        `, { eval: true, execArgv: [], workerData: { modulePath: resolve("src/adapters/audit/sqlite-spend-reservation-store.ts"), path, input: input(requestId, "60") } });
        workers.push(worker);
        const ready = new Promise<void>((resolveReady, reject) => {
          worker.once("message", () => resolveReady());
          worker.once("error", reject);
        });
        const result = new Promise<ReserveSpendResult>((resolveResult, reject) => {
          worker.on("message", (message: { result?: ReserveSpendResult }) => { if (message.result) resolveResult(message.result); });
          worker.once("error", reject);
        });
        return { ready, result };
      });
      await Promise.all(attempts.map((attempt) => attempt.ready));
      workers.forEach((worker) => worker.postMessage("reserve"));
      const results = await Promise.all(attempts.map((attempt) => attempt.result));
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "ROLLING_LIMIT_EXCEEDED" }]);
      const observer = new SqliteSpendReservationStore(path);
      try {
        expect(observer.list()).toHaveLength(1);
        expect(observer.verifyEventChain()).toBe(true);
      } finally {
        observer.close();
      }
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
      rmSync(directory, { recursive: true });
    }
  }, 20_000);
});
