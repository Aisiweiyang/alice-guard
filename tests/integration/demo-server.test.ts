import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteAuditStore } from "../../src/adapters/audit/sqlite-audit-store";
import { DemoPresentationSchema } from "../../src/server/api-schemas";
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
});
