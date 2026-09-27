import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SqliteAuditStore } from "../src/adapters/audit/sqlite-audit-store";
import { createDemoHttpServer, DemoApiService } from "../src/server/demo-server";

// The public entry point never loads .env.local or constructs a Privy client.
// Refuse a deployment that accidentally provides wallet credentials.
if (process.argv.length !== 2 || Object.entries(process.env).some(([name, value]) => name.startsWith("PRIVY_") && Boolean(value))) {
  throw new Error("PUBLIC_DEMO_CONFIGURATION_REJECTED");
}
if (process.env["ALICE_GUARD_WALLET_MODE"] && process.env["ALICE_GUARD_WALLET_MODE"] !== "disabled") {
  throw new Error("PUBLIC_DEMO_CONFIGURATION_REJECTED");
}

const port = Number(process.env["PORT"] ?? "10000");
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PUBLIC_DEMO_PORT_INVALID");

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDirectory = resolve("demo-output", `public-web-${runId}`);
mkdirSync(outputDirectory, { recursive: true });
const store = new SqliteAuditStore(resolve(outputDirectory, "alice-guard-public-audit.sqlite"));
const server = createDemoHttpServer(new DemoApiService(store));

await new Promise<void>((resolvePromise, reject) => {
  server.once("error", reject);
  server.listen(port, "0.0.0.0", () => {
    server.off("error", reject);
    resolvePromise();
  });
});
process.stdout.write(`Alice Guard offline public demo listening on port ${port}; signing and broadcast disabled.\n`);

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
