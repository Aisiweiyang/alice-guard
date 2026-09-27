import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readJudgeEvidenceFile } from "../../src/adapters/audit/judge-evidence-file";
import { verifyJudgeEvidencePack } from "../../src/application/judge-evidence";
import { MAX_JUDGE_EVIDENCE_BYTES } from "../../src/domain/judge-evidence";

const CANARY = "SYNTHETIC_FILE_SECRET_MUST_NOT_ESCAPE";
const workspace = resolve(".");
const verifierScript = resolve("scripts/verify-judge-evidence.ts");
const exporterScript = resolve("scripts/export-judge-evidence.ts");
const tsxImport = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
let directory: string;

beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "alice-judge-files-")); });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

async function cli(script: string, args: string[], cwd = workspace) {
  return new Promise<{ code: number | string; stdout: string; stderr: string }>(resolveResult => {
    execFile(process.execPath, ["--import", tsxImport, script, ...args], {
      cwd, timeout: 25_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NODE_NO_WARNINGS: "1", PRIVY_APP_SECRET: CANARY, PRIVY_AUTHORIZATION_PRIVATE_KEY: CANARY },
    }, (error, stdout, stderr) => resolveResult({ code: error?.code ?? 0, stdout, stderr }));
  });
}

describe("judge evidence local file boundary", () => {
  it("accepts exactly 2 MiB, including whitespace, and rejects one additional byte", async () => {
    const exact = join(directory, "exact.json");
    await writeFile(exact, `${" ".repeat(MAX_JUDGE_EVIDENCE_BYTES - 2)}{}`);
    await expect(readJudgeEvidenceFile(exact)).resolves.toEqual({});
    const over = join(directory, "over.json");
    await writeFile(over, `${" ".repeat(MAX_JUDGE_EVIDENCE_BYTES - 1)}{}`);
    await expect(readJudgeEvidenceFile(over)).rejects.toThrow("JUDGE_EVIDENCE_FILE_REJECTED");
  });

  it("measures UTF-8 bytes rather than JavaScript character count", async () => {
    const path = join(directory, "multibyte.json");
    const text = JSON.stringify("界".repeat(Math.ceil(MAX_JUDGE_EVIDENCE_BYTES / 3)));
    expect(text.length).toBeLessThan(MAX_JUDGE_EVIDENCE_BYTES);
    expect(Buffer.byteLength(text)).toBeGreaterThan(MAX_JUDGE_EVIDENCE_BYTES);
    await writeFile(path, text);
    await expect(readJudgeEvidenceFile(path)).rejects.toThrow("JUDGE_EVIDENCE_FILE_REJECTED");
  });

  it("requires a JSON filename and a regular file", async () => {
    await expect(readJudgeEvidenceFile(join(directory, ".env.local"))).rejects.toThrow("JUDGE_JSON_FILE_REQUIRED");
    const directoryPath = join(directory, "directory.json");
    await mkdir(directoryPath);
    await expect(readJudgeEvidenceFile(directoryPath)).rejects.toThrow();
    const upper = join(directory, "upper.JSON");
    await writeFile(upper, "{}");
    await expect(readJudgeEvidenceFile(upper)).resolves.toEqual({});
  });

  it("rejects parsed deep JSON without recursion errors or reflecting attacker fields", async () => {
    const path = join(directory, "deep.json");
    await writeFile(path, `${"[".repeat(20_000)}"${CANARY}"${"]".repeat(20_000)}`);
    const parsed = await readJudgeEvidenceFile(path);
    const result = await verifyJudgeEvidencePack(parsed);
    expect(result).toMatchObject({ status: "REJECTED", reasonCodes: ["INVALID_JUDGE_EVIDENCE_SCHEMA"] });
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  it("independent export and verify processes work from an isolated directory without loading .env.local", async () => {
    const isolated = join(directory, "isolated");
    await mkdir(isolated);
    await writeFile(join(isolated, ".env.local"), `THIS IS DELIBERATELY NOT A VALID ENV FILE ${CANARY}`);
    const exported = await cli(exporterScript, [], isolated);
    expect(exported.code, exported.stderr).toBe(0);
    const metadata = JSON.parse(exported.stdout) as { status: string; outputPath: string; selfCheck: string; packHash: string };
    expect(metadata).toMatchObject({ status: "EXPORTED", selfCheck: "VERIFIED" });
    expect(metadata.outputPath.startsWith(join(isolated, "demo-output"))).toBe(true);
    const file = await readFile(metadata.outputPath, "utf8");
    expect(file).not.toContain(CANARY);
    expect(file).not.toContain(isolated);
    const verified = await cli(verifierScript, [metadata.outputPath], isolated);
    expect(verified.code, verified.stderr).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({ status: "VERIFIED", packHash: metadata.packHash, referencePackHash: metadata.packHash, executionAuthorized: false });
    expect(verified.stdout + verified.stderr).not.toContain(CANARY);
  }, 60_000);

  it.each(["malformed", "oversized", "missing", "wrong-extension"] as const)("CLI rejects %s input without printing contents, file paths or stack traces", async kind => {
    const path = join(directory, `${CANARY}-${kind}.${kind === "wrong-extension" ? "env" : "json"}`);
    if (kind === "malformed") await writeFile(path, `{"secret":"${CANARY}",}`);
    if (kind === "oversized") await writeFile(path, " ".repeat(MAX_JUDGE_EVIDENCE_BYTES + 1));
    const result = await cli(verifierScript, [path]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({ status: "REJECTED", reasonCode: "JUDGE_EVIDENCE_READ_FAILED", executionAuthorized: false });
    expect(result.stderr).not.toContain(CANARY);
    expect(result.stderr).not.toMatch(/SyntaxError|ENOENT|stack|node:internal/);
  });

  it.each([[], ["--help"], ["one.json", "two.json"]].map(args => ({ args })))("CLI rejects an invalid argument list $args", async ({ args }) => {
    const result = await cli(verifierScript, args);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ status: "REJECTED", reasonCode: "JUDGE_EVIDENCE_READ_FAILED", executionAuthorized: false });
  });
});
