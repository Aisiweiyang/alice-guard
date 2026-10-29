import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function run(script, args = []) {
  const output = execFileSync(process.execPath, ["--import", "tsx", resolve("scripts", script), ...args], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(output);
}

const exported = run("export-judge-evidence.ts");
if (exported.status !== "EXPORTED" || exported.selfCheck !== "VERIFIED") throw new Error("EVIDENCE_EXPORT_FAILED");
const verified = run("verify-judge-evidence.ts", [exported.outputPath]);
if (verified.status !== "VERIFIED" || verified.executionAuthorized !== false || verified.packHash !== exported.packHash) {
  throw new Error("EVIDENCE_REPLAY_FAILED");
}
console.log(JSON.stringify({ status: "VERIFIED", packHash: verified.packHash, executionAuthorized: false }, null, 2));
