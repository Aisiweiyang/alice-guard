import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// This is a narrow release guard, not a general-purpose secret scanner.
// Report paths and rule names only; never print a matched credential.
const git = (args, options = {}) => execFileSync("git", args, { maxBuffer: 32 * 1024 * 1024, ...options });
const forbiddenPath = /(?:^|\/)(?:node_modules|demo-output|delivery|\.git)(?:\/|$)|\.(?:sqlite3?|db)(?:-|$)|\.(?:pem|key|p12|pfx)$/i;
const secretRules = [
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["github-fine-grained-token", /\bgithub_pat_[A-Za-z0-9_]{30,}\b/],
  ["api-secret", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32,}/],
  ["wallet-authorization-key", /wallet-(?:auth|api):[A-Za-z0-9+/=]{40,}/],
];
const findings = [];
function inspect(path, bytes, history = false) {
  const label = history ? `history:${path}` : path;
  if (forbiddenPath.test(path) || (/(?:^|\/)\.env(?:\.|$)/.test(path) && path !== ".env.example")) {
    findings.push({ path: label, rule: "excluded-file" });
  }
  const text = bytes.toString("utf8");
  for (const [rule, pattern] of secretRules) if (pattern.test(text)) findings.push({ path: label, rule });
  if (!history && /(?:[A-Za-z]:[\\/]+Users|\/Users|\/home)[\\/]+[A-Za-z0-9_.-]+[\\/]/i.test(text)) findings.push({ path, rule: "personal-absolute-path" });
}

const files = [...new Set(git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean))];
for (const path of files) inspect(path, readFileSync(path));
for (const path of ["LICENSE", "README.md", "README.en.md", "SECURITY.md", "CONTRIBUTING.md", "AUTHORS.md", "THIRD_PARTY_NOTICES.md", "docs/VALIDATION.md", ".github/workflows/ci.yml"]) {
  if (!files.includes(path)) findings.push({ path, rule: "required-release-file-missing" });
}

let historicalBlobs = 0;
if (process.argv.includes("--history")) {
  const objects = git(["rev-list", "--objects", "--all"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const names = new Map(objects.map(line => [line.split(" ", 1)[0], line.slice(line.indexOf(" ") + 1)]));
  const ids = [...names.keys()];
  const types = git(["cat-file", "--batch-check"], { input: `${ids.join("\n")}\n`, encoding: "utf8" });
  const blobs = types.trim().split("\n").filter(line => line.split(" ")[1] === "blob").map(line => line.split(" ", 1)[0]);
  const batch = git(["cat-file", "--batch"], { input: `${blobs.join("\n")}\n` });
  let offset = 0;
  while (offset < batch.length) {
    const end = batch.indexOf(10, offset);
    const [sha, type, size] = batch.subarray(offset, end).toString("utf8").split(" ");
    if (end < offset || type !== "blob" || !/^\d+$/.test(size ?? "")) throw new Error("HISTORY_INVENTORY_INVALID");
    const start = end + 1;
    inspect(names.get(sha) ?? sha, batch.subarray(start, start + Number(size)), true);
    historicalBlobs++;
    offset = start + Number(size) + 1;
  }
}
console.log(JSON.stringify({ status: findings.length ? "REJECTED" : "PASS", files: files.length, historicalBlobs,
  scope: "Known credential patterns, excluded files and current personal paths; manual review is still required.", findings }, null, 2));
if (findings.length) process.exitCode = 1;
