import { readJudgeEvidenceFile } from "../src/adapters/audit/judge-evidence-file";
import { verifyJudgeEvidencePack } from "../src/application/judge-evidence";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0] || args[0].startsWith("--")) throw new Error("JUDGE_VERIFY_REQUIRES_ONE_JSON_PATH");
  const result = await verifyJudgeEvidencePack(await readJudgeEvidenceFile(args[0]));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "VERIFIED") process.exitCode = 1;
} catch {
  // Do not echo path, parsed fields, filesystem errors, or an upstream stack.
  console.error(JSON.stringify({status: "REJECTED", reasonCode: "JUDGE_EVIDENCE_READ_FAILED", executionAuthorized: false}));
  process.exitCode = 1;
}
