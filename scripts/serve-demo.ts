import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { SqliteAuditStore } from "../src/adapters/audit/sqlite-audit-store";
import { createDemoHttpServer, DemoApiService, listenOnLocalhost } from "../src/server/demo-server";

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve("demo-output", `web-${runId}`);
mkdirSync(outputDirectory, { recursive: true });
const store = new SqliteAuditStore(resolve(outputDirectory, "alice-guard-web-audit.sqlite"));
const server = createDemoHttpServer(new DemoApiService(store));
const requestedPort = Number(process.env["ALICE_GUARD_DEMO_PORT"] ?? "4173");
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  throw new Error("INVALID_DEMO_PORT");
}

const port = await listenOnLocalhost(server, requestedPort);
process.stdout.write(`Alice Guard judge demo: http://127.0.0.1:${port}\n`);
process.stdout.write("Mode: OFFLINE DEMO | WALLET DISABLED | SIGNING DISABLED | BROADCAST DISABLED\n");

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
