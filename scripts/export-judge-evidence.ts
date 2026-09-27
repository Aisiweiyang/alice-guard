import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { buildJudgeEvidencePack, verifyJudgeEvidencePack } from "../src/application/judge-evidence";

try {
  if (process.argv.slice(2).length !== 0) throw new Error("JUDGE_EXPORT_TAKES_NO_ARGUMENTS");
  const pack = await buildJudgeEvidencePack();
  const verification = await verifyJudgeEvidencePack(pack);
  if (verification.status !== "VERIFIED") throw new Error("JUDGE_EXPORT_SELF_CHECK_FAILED");
  const outputRoot = resolve("demo-output");
  await mkdir(outputRoot, {recursive: true});
  const directory = await mkdtemp(join(outputRoot, "judge-evidence-"));
  const outputPath = join(directory, "judge-evidence.json");
  await writeFile(outputPath, `${JSON.stringify(pack, null, 2)}\n`, {encoding: "utf8", flag: "wx", mode: 0o600});
  console.log(JSON.stringify({status: "EXPORTED", outputPath, packHash: pack.packHash, metrics: pack.metrics,
    selfCheck: verification.status, attestation: "UNATTESTED", signingPerformed: false, broadcastPerformed: false, fundingPerformed: false}, null, 2));
} catch {
  console.error(JSON.stringify({status: "FAILED", reasonCode: "JUDGE_EXPORT_FAILED", executionAuthorized: false}));
  process.exitCode = 1;
}
