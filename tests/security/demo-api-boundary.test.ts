import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { DemoApiService } from "../../src/server/demo-server";

describe("judge demo API trust boundary", () => {
  let store: SqliteAuditStore;
  let service: DemoApiService;

  beforeEach(() => {
    store = new SqliteAuditStore(":memory:");
    service = new DemoApiService(store);
  });

  afterEach(() => store.close());

  it("accepts only a supported scenario ID with no extra transaction fields", async () => {
    for (const candidate of [
      { scenario: "unknown" },
      { scenario: "allowed-small-swap", calldata: "0xdeadbeef" },
      { scenario: "allowed-small-swap", walletAddress: `0x${"11".repeat(20)}` },
      { scenario: "allowed-small-swap", contractAddress: `0x${"22".repeat(20)}` },
      { scenario: "denied-over-limit", status: "prepared", policyDecision: "allow" },
      { scenario: "allowed-small-swap", text: "x".repeat(3_000) },
    ]) {
      const reply = await service.run(candidate);
      expect(reply.status).toBe(400);
      expect(reply.body).toEqual({
        error: { code: "INVALID_DEMO_REQUEST", message: "Request must contain one supported scenario only." },
      });
    }
    expect(store.list()).toHaveLength(0);
  });

  it("returns only disabled wallet capabilities", () => {
    expect(service.health()).toEqual({
      status: 200,
      body: {
        service: "alice-guard-demo",
        mode: "offline-demo-no-wallet",
        walletEnabled: false,
        signingEnabled: false,
        broadcastEnabled: false,
      },
    });
  });

  it("never exposes provider errors through the Privy status route", async () => {
    const unsafeService = new DemoApiService(store, {
      read: async () => { throw new Error("appSecret=provider-secret privateKey=provider-key"); },
    });
    const reply = await unsafeService.privyStatus();
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({
      status: "DEGRADED",
      safeReason: "PRIVY_LIVE_STATUS_UNAVAILABLE",
      capabilities: { signing: false, broadcast: false, funding: false },
    });
    expect(JSON.stringify(reply.body)).not.toMatch(/provider-secret|provider-key|appSecret|privateKey/u);
  });

  it("does not expose paths, SQLite errors, or stack traces", async () => {
    const invalid = await service.run({ scenario: "allowed-small-swap", unexpected: true });
    const serialized = JSON.stringify(invalid.body);
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized.toLowerCase()).not.toContain("sqlite");
    expect(serialized.toLowerCase()).not.toContain("stack");
  });

  it("repeated scenario runs append distinct audits without overwriting", async () => {
    const first = await service.run({ scenario: "allowed-small-swap" });
    const second = await service.run({ scenario: "allowed-small-swap" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(store.list()).toHaveLength(2);
    expect(store.list()[1]?.previousRecordHash).toBe(store.list()[0]?.recordHash);
    expect(store.verifyChain()).toBe(true);
  });

  it("proves early stop boundaries in the safe presentation", async () => {
    const overLimit = await service.run({ scenario: "denied-over-limit" });
    expect(overLimit.body).toMatchObject({
      status: "denied",
      stoppedAt: "policy",
      plan: null,
      checks: { policyEvaluated: true, planCreated: false, planValidated: false },
      execution: "not_attempted",
    });

    const injection = await service.run({ scenario: "denied-prompt-injection" });
    expect(injection.body).toMatchObject({
      status: "denied",
      stoppedAt: "intent",
      risk: null,
      policy: null,
      plan: null,
      checks: {
        intentAccepted: false,
        evidenceCollected: false,
        riskEvaluated: false,
        policyEvaluated: false,
        planCreated: false,
        planValidated: false,
      },
      execution: "not_attempted",
    });
  });

  it("returns audit summaries without the local database path", async () => {
    await service.run({ scenario: "allowed-small-swap" });
    const reply = service.audits();
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ chainValid: true, records: [{ status: "prepared", eventCount: 7 }] });
    expect(store.list()[0]?.events.map(event => event.type)).toEqual([
      "request.received", "intent.accepted", "risk.evaluated", "policy.decided", "plan.validated", "capsule.created", "capsule.verified",
    ]);
    expect(JSON.stringify(reply.body)).not.toContain("audit.sqlite");
  });

  it("bounds concurrent runs and reserves capacity before awaiting", async () => {
    const bounded = new DemoApiService(store, undefined, { maxAuditRecords: 2, maxConcurrentRuns: 2 });
    const replies = await Promise.all(Array.from({ length: 8 }, () => bounded.run({ scenario: "allowed-small-swap" })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(2);
    expect(replies.filter(reply => reply.status === 429)).toHaveLength(6);
    expect(store.count()).toBe(2);
    expect(store.verifyChain()).toBe(true);
    const restartedService = new DemoApiService(store, undefined, { maxAuditRecords: 2 });
    expect(await restartedService.run({ scenario: "denied-over-limit" })).toMatchObject({ status: 429, body: { error: { code: "DEMO_CAPACITY_REACHED" } } });
    expect(store.count()).toBe(2);
  });

  it("releases its concurrency slot after a failed audit write", async () => {
    const bounded = new DemoApiService(store, undefined, { maxConcurrentRuns: 1 });
    vi.spyOn(store, "append").mockImplementationOnce(() => { throw new Error("synthetic disk error"); });
    expect((await bounded.run({ scenario: "allowed-small-swap" })).status).toBe(500);
    expect((await bounded.run({ scenario: "allowed-small-swap" })).status).toBe(200);
    expect(store.count()).toBe(1);
  });

  it("reads audits once, limits summaries, and verifies records outside the displayed window", async () => {
    const bounded = new DemoApiService(store, undefined, { auditSummaryLimit: 1 });
    await bounded.run({ scenario: "allowed-small-swap" });
    await bounded.run({ scenario: "denied-over-limit" });
    const snapshot = store.list();
    const listSpy = vi.spyOn(store, "list");
    expect(bounded.audits().body).toMatchObject({ chainValid: true, totalRecords: 2, truncated: true, records: [{ status: "denied" }] });
    expect(listSpy).toHaveBeenCalledTimes(1);
    listSpy.mockReturnValue([{ ...snapshot[0]!, recordHash: `0x${"ff".repeat(32)}` }, snapshot[1]!]);
    expect(bounded.audits().body).toMatchObject({ chainValid: false, totalRecords: 2 });
  });

  it("bounds simultaneous attack cases without changing the control result", async () => {
    const bounded = new DemoApiService(store, undefined, { maxConcurrentAttacks: 1 });
    const catalog = await bounded.dispatch("GET", "/api/attack-lab");
    const caseId = (catalog.body as { cases: { id: string }[] }).cases[0]!.id;
    const replies = await Promise.all(Array.from({ length: 3 }, () => bounded.dispatch("POST", "/api/attack-lab", { caseId })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
    expect(replies.filter(reply => reply.status === 429)).toHaveLength(2);
    expect((await bounded.dispatch("POST", "/api/attack-lab", { caseId })).body).toMatchObject({ passed: true });
  });
});
