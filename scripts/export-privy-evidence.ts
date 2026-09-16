import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createLivePrivyJudgeStatusProvider } from "../src/adapters/privy/privy-status-runtime";
import { readPrivyLiveEnvironment } from "../src/config/privy-live";

const status = await createLivePrivyJudgeStatusProvider(readPrivyLiveEnvironment(process.env)).read();
const runId = status.checkedAt.replace(/[:.]/gu, "-");
const outputDirectory = resolve("demo-output", `privy-evidence-${runId}`);
const outputPath = resolve(outputDirectory, "privy-live-status.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(status, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  status: status.status,
  safeReason: status.safeReason,
  outputPath,
  signingPerformed: false,
  broadcastPerformed: false,
  fundingPerformed: false,
}, null, 2)}\n`);
if (status.status !== "VERIFIED") process.exitCode = 1;
