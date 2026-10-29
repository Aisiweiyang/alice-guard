import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { request as httpRequest, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { PrivyJudgeStatusSchema } from "../../src/application/privy-judge-status";
import { DemoPresentationSchema } from "../../src/server/api-schemas";
import { JudgeEvidencePackSchema } from "../../src/domain/judge-evidence";
import { createDemoHttpServer, DemoApiService, listenOnLocalhost } from "../../src/server/demo-server";

describe("local judge demo server", () => {
  let store: SqliteAuditStore;
  let server: Server;
  let origin: string;

  beforeEach(async () => {
    store = new SqliteAuditStore(":memory:");
    server = createDemoHttpServer(new DemoApiService(store));
    origin = `http://127.0.0.1:${await listenOnLocalhost(server, 0)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    store.close();
  });

  it("serves the static control room with restrictive security headers", async () => {
    const response = await fetch(`${origin}/`);
    const page = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(page).toContain("Alice Guard");
    expect(page).toContain("NOT ATTEMPTED");
    expect(page.toLowerCase()).not.toContain("explorer link");
    expect(page).not.toContain("TRANSACTION SUCCESS");
  });

  it("runs a scenario through the server and returns a validated presentation", async () => {
    const response = await fetch(`${origin}/api/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "allowed-small-swap" }),
    });
    const body = DemoPresentationSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "prepared",
      stoppedAt: "plan",
      policy: { decision: "allow" },
      plan: { validated: true, transactionCount: 2 },
      walletPolicy: {
        status: "NOT_CONFIGURED",
        mode: "offline-manifest-only",
      },
      audit: { chainValid: true },
      execution: "not_attempted",
      capabilities: { wallet: false, signing: false, broadcast: false },
    });
    expect(body.walletPolicy.coverage).toHaveLength(15);
    expect(JSON.stringify(body)).not.toMatch(/record_json|appSecret|privateKey|walletId/u);
  });

  it("serves a safe disabled Privy status by default", async () => {
    const response = await fetch(`${origin}/api/privy/status`);
    const body = PrivyJudgeStatusSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      mode: "disabled",
      status: "NOT_CONFIGURED",
      capabilities: { walletProvisioned: false, signing: false, broadcast: false, funding: false },
    });
  });

  it("rejects oversized, malformed, and wrong-content-type bodies safely", async () => {
    const oversized = await fetch(`${origin}/api/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "allowed-small-swap", padding: "x".repeat(3_000) }),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: { code: "REQUEST_TOO_LARGE", message: "The request body was rejected." } });

    const malformed = await fetch(`${origin}/api/demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: "INVALID_JSON" } });

    const wrongType = await fetch(`${origin}/api/demo`, { method: "POST", body: "{}" });
    expect(wrongType.status).toBe(415);
    expect(await wrongType.json()).toMatchObject({ error: { code: "CONTENT_TYPE_REQUIRED" } });
  });

  it("keeps browser code free of unsafe dynamic HTML sinks", async () => {
    const source = await readFile(resolve("src", "ui", "app.js"), "utf8");
    expect(source).not.toMatch(/\.innerHTML\s*=/u);
    expect(source).not.toContain("eval(");
    expect(source).not.toContain("document.write");
  });

  it("downloads deterministic fixtures without exporting the active audit store", async () => {
    await fetch(`${origin}/api/demo`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({scenario: "allowed-small-swap"})});
    const userRecord = store.list()[0]!;
    const responses = await Promise.all([fetch(`${origin}/api/evidence/judge`), fetch(`${origin}/api/evidence/judge`)]);
    expect(responses[0]!.status).toBe(200);
    expect(responses[0]!.headers.get("content-disposition")).toBe('attachment; filename="alice-guard-judge-evidence.json"');
    expect(responses[0]!.headers.get("x-content-type-options")).toBe("nosniff");
    expect(responses[0]!.headers.get("cache-control")).toBe("no-store");
    const pack = JudgeEvidencePackSchema.parse(await responses[0]!.json());
    expect(pack).toEqual(await responses[1]!.json());
    expect(pack.metrics).toMatchObject({caseCount: 51, repeatCount: 1, passedCaseCount: 51});
    expect(pack.scenarios.some(s => s.audit.request.requestId === userRecord.request.requestId)).toBe(false);
    expect(store.list()).toHaveLength(1);
    const unsupported = await fetch(`${origin}/api/evidence/judge`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: ".env.local"})});
    expect(unsupported.status).toBe(404);
  });

  it("rejects malformed absolute targets without crashing and continues serving health", async () => {
    const url = new URL(origin);
    for (const target of ["http://[", "//unexpected.example/api/health", "/api\\health"]) {
      const status = await new Promise<number | undefined>((resolveStatus, reject) => {
        const request = httpRequest({ hostname: url.hostname, port: url.port, path: target, method: "GET" }, response => {
          response.resume();
          response.on("end", () => resolveStatus(response.statusCode));
        });
        request.on("error", reject);
        request.end();
      });
      expect(status).toBe(400);
    }
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
  });

  it("rejects cross-origin browsers while accepting same-origin and CLI clients", async () => {
    for (const headers of [{ Origin: "https://foreign.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }]) {
      const response = await fetch(`${origin}/api/health`, { headers });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "CROSS_ORIGIN_REQUEST" } });
    }
    expect((await fetch(`${origin}/api/health`, { headers: { Origin: origin } })).status).toBe(200);
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
  });

  it("requires the exact JSON media type", async () => {
    for (const type of ["application/jsonp", "application/json-invalid"]) {
      expect((await fetch(`${origin}/api/demo`, { method: "POST", headers: { "Content-Type": type }, body: "{}" })).status).toBe(415);
    }
    const accepted = await fetch(`${origin}/api/demo`, { method: "POST", headers: { "Content-Type": "APPLICATION/JSON; charset=utf-8" }, body: JSON.stringify({ scenario: "denied-prompt-injection" }) });
    expect(accepted.status).toBe(200);
  });

  it("returns a clear capacity error while keeping health available", async () => {
    await new DemoApiService(store).run({ scenario: "allowed-small-swap" });
    await new Promise<void>(resolveClosed => server.close(() => resolveClosed()));
    server = createDemoHttpServer(new DemoApiService(store, undefined, { maxAuditRecords: 1 }));
    origin = `http://127.0.0.1:${await listenOnLocalhost(server, 0)}`;
    const response = await fetch(`${origin}/api/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: "allowed-small-swap" }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: "DEMO_CAPACITY_REACHED" } });
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
  });
});
