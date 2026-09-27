import { open } from "node:fs/promises";
import { extname } from "node:path";
import { MAX_JUDGE_EVIDENCE_BYTES } from "../../domain/judge-evidence";

/** Bounded read from one explicitly supplied local JSON file; never echo its contents on error. */
export async function readJudgeEvidenceFile(path: string): Promise<unknown> {
  if (extname(path).toLowerCase() !== ".json") throw new Error("JUDGE_JSON_FILE_REQUIRED");
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_JUDGE_EVIDENCE_BYTES) throw new Error("JUDGE_EVIDENCE_FILE_REJECTED");
    const buffer = Buffer.alloc(MAX_JUDGE_EVIDENCE_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const {bytesRead} = await handle.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > MAX_JUDGE_EVIDENCE_BYTES) throw new Error("JUDGE_EVIDENCE_FILE_REJECTED");
    try {return JSON.parse(buffer.subarray(0, total).toString("utf8"));}
    catch {throw new Error("JUDGE_EVIDENCE_JSON_INVALID");}
  } finally {await handle.close();}
}
