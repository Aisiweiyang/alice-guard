import { describe, expect, it } from "vitest";
import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { DemoApiService } from "../../src/server/demo-server";
import { DemoPresentationSchema } from "../../src/server/api-schemas";
import { computeAuditRecordHash } from "../../src/application/audit-store";
import { replayDecisionProof } from "../../src/application/replay-decision-proof";
import { DEMO_NOW } from "../../src/demo/demo-template";

describe("proof and offline laboratory integration", () => {
  it("persists the capsule inside the append-only hash-chained audit", async () => {
    const store = new SqliteAuditStore(":memory:");
    try {
      const api = new DemoApiService(store);
      const response = await api.run({scenario: "allowed-small-swap"});
      expect(response.status).toBe(200);
      const body = DemoPresentationSchema.parse(response.body);
      expect(body.proof?.verification).toEqual({ok: true, reasonCodes: [], executionAuthorized: false});
      const record = store.list()[0]!;
      expect(record.decisionCapsule).toEqual(body.proof?.capsule);
      expect(record.recordHash).toBe(computeAuditRecordHash(record));
      const options = {now: DEMO_NOW, mode: "proposal" as const, autonomyState: "PROPOSE_ONLY" as const,
        nonceStatus: "UNUSED" as const, walletPolicyStatus: "NOT_CONFIGURED" as const, budgetStatus: "NOT_RESERVED" as const};
      expect(replayDecisionProof(record, options).ok).toBe(true);
      expect(replayDecisionProof({...record, decisionMaterialJson: "{}"}, options).reasonCodes).toContain("AUDIT_RECORD_HASH_MISMATCH");
      expect(replayDecisionProof(record, {...options, now: "2026-09-18T00:00:00.000Z"}).ok).toBe(false);
      expect(store.verifyChain()).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/"trusted"|"material"|"options"/);
      const denied = DemoPresentationSchema.parse((await api.run({scenario: "denied-over-limit"})).body);
      expect(denied.proof?.capsule.verdict).toBe("DENY");
      expect(denied.proof?.verification.ok).toBe(false);
    } finally {store.close();}
  });
  it("accepts case ids only, never client authority or arbitrary mutations", async () => {
    const store = new SqliteAuditStore(":memory:");
    try {
      const api = new DemoApiService(store);
      expect((await api.dispatch("GET", "/api/attack-lab")).status).toBe(200);
      expect((await api.dispatch("POST", "/api/attack-lab", {caseId: "intent-resealed", trusted: {}})).status).toBe(400);
      expect((await api.dispatch("POST", "/api/attack-lab", {caseId: "unknown"})).status).toBe(400);
      expect((await api.dispatch("POST", "/api/attack-lab", {caseId: "intent-resealed"})).body).toMatchObject({passed: true, observed: "DENY", walletReached: false, executionAuthorized: false});
      expect((await api.dispatch("POST", "/api/attack-lab", {caseId: "benign-20-usdc"})).body).toMatchObject({passed: true, observed: "ALLOW", walletReached: false});
      expect((await api.dispatch("POST", "/api/execute", {})).status).toBe(404);
    } finally {store.close();}
  });
});
