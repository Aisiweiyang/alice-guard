import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { SqliteAuditStore } from "../src/adapters/audit/sqlite-audit-store";
import { createLivePrivyJudgeStatusProvider } from "../src/adapters/privy/privy-status-runtime";
import { DisabledPrivyJudgeStatusProvider } from "../src/application/privy-judge-status";
import { readPrivyLiveEnvironment } from "../src/config/privy-live";
import { createDemoHttpServer, DemoApiService, listenOnLocalhost } from "../src/server/demo-server";

const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--privy-status") || arguments_.filter((argument) => argument === "--privy-status").length > 1) {
  throw new Error("UNSUPPORTED_DEMO_ARGUMENT");
}
const livePrivyStatusEnabled = arguments_.includes("--privy-status");

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve("demo-output", `web-${runId}`);
mkdirSync(outputDirectory, { recursive: true });
const store = new SqliteAuditStore(resolve(outputDirectory, "alice-guard-web-audit.sqlite"));
const privyStatusProvider = livePrivyStatusEnabled
  ? createLivePrivyJudgeStatusProvider(readPrivyLiveEnvironment(process.env))
  : new DisabledPrivyJudgeStatusProvider();
const server = createDemoHttpServer(new DemoApiService(store, privyStatusProvider));
const requestedPort = Number(process.env["ALICE_GUARD_DEMO_PORT"] ?? "4187");
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  throw new Error("INVALID_DEMO_PORT");
}

const port = await listenOnLocalhost(server, requestedPort);
process.stdout.write(`Alice Guard judge demo: http://127.0.0.1:${port}\n`);
process.stdout.write(`Mode: ${livePrivyStatusEnabled ? "LIVE READ-ONLY PRIVY STATUS" : "OFFLINE DEMO"} | SIGNING DISABLED | BROADCAST DISABLED\n`);

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
