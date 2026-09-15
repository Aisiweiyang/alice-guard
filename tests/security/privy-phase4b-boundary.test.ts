import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PrivyNodeWalletReader } from "../../src/adapters/privy/privy-wallet-client";
import { PrivyNodeProvisioningClient } from "../../src/adapters/privy/privy-provisioning-client";

const PHASE4B_FILES = [
  "scripts/configure-privy-local.ps1",
  "scripts/setup-demo-wallet.ts",
  "scripts/verify-wallet-policy.ts",
  "scripts/test-wallet-policy-denials.ts",
  "scripts/revoke-demo-wallet.ts",
  "src/adapters/privy/privy-policy-manager.ts",
  "src/adapters/privy/privy-public-state.ts",
  "src/adapters/privy/privy-wallet-client.ts",
  "src/application/privy-provisioning-plan.ts",
];

describe("Privy Phase 4B-1 capability boundary", () => {
  it("contains no remote mutation, signing, broadcast or key-export call", async () => {
    const source = (await Promise.all(PHASE4B_FILES.map((path) => readFile(resolve(path), "utf8")))).join("\n");
    for (const forbidden of [
      /\.create\s*\(/u,
      /\.update\s*\(/u,
      /\.delete\s*\(/u,
      /\.archive\s*\(/u,
      /\.rpc\s*\(/u,
      /\.sign(?:Message|Transaction|TypedData)\s*\(/u,
      /\.sendTransaction\s*\(/u,
      /\.exportPrivateKey\s*\(/u,
    ]) expect(source).not.toMatch(forbidden);
  });

  it("exposes only a read method on the SDK wallet adapter", () => {
    const names = Object.getOwnPropertyNames(PrivyNodeWalletReader.prototype);
    expect(names).toEqual(["constructor", "readWallet"]);
  });

  it("keeps all live-like script arguments fail-closed in source", async () => {
    for (const path of ["scripts/setup-demo-wallet.ts", "scripts/test-wallet-policy-denials.ts", "scripts/revoke-demo-wallet.ts"]) {
      const source = await readFile(resolve(path), "utf8");
      expect(source).toContain("DENIED");
      expect(source).toContain("--dry-run");
    }
  });

  it("collects secrets through hidden local input and leaves wallet mode disabled", async () => {
    const source = await readFile(resolve("scripts/configure-privy-local.ps1"), "utf8");
    expect(source).toContain("Read-Host -Prompt $Prompt -AsSecureString");
    expect(source).toContain('ALICE_GUARD_WALLET_MODE=disabled');
    expect(source).toContain('".env.local"');
    expect(source).toContain("SetAccessRuleProtection($true, $false)");
    expect(source).toContain('Write-Host "SAFE_STAGE=$stage"');
    expect(source).toContain("Test-PrivyAuthorizationPrivateKey");
    expect(source).not.toMatch(/Write-(?:Host|Output).*\$(?:appSecret|authorizationPrivateKey)/u);
  });

  it("limits the Phase 4B-2 SDK adapter to owner reads and two provisioning creates", async () => {
    const names = Object.getOwnPropertyNames(PrivyNodeProvisioningClient.prototype);
    expect(names).toEqual(["constructor", "verifyOwnerKey", "createPolicy", "readPolicy", "createWallet", "readWallet"]);
    const source = await readFile(resolve("src/adapters/privy/privy-provisioning-client.ts"), "utf8");
    expect(source).not.toMatch(/\.rpc\s*\(|\.rawSign\s*\(|\.transfer\s*\(|\.sendTransaction\s*\(|\.exportPrivateKey\s*\(/u);
    expect(source.match(/\.create\s*\(/gu)).toHaveLength(2);
    expect(source.match(/idempotency_key:/gu)).toHaveLength(2);
  });

  it("requires both an apply flag and exact confirmation hash in the provisioning entrypoint", async () => {
    const source = await readFile(resolve("scripts/provision-privy-wallet.ts"), "utf8");
    expect(source).toContain('arguments_.includes("--apply")');
    expect(source).toContain('argument.startsWith("--confirmation-hash=")');
    expect(source).toContain("PRIVY_EXACT_APPLY_CONFIRMATION_REQUIRED");
    expect(source).not.toMatch(/\.rpc\s*\(|signMessage|sendTransaction|exportPrivateKey/u);
    expect(source).toContain('remoteMutationsPerformed: "UNKNOWN"');
  });

  it("keeps owner verification read-only", async () => {
    const source = await readFile(resolve("scripts/verify-privy-owner.ts"), "utf8");
    expect(source).toContain("verifyOwnerKey");
    expect(source).not.toMatch(/createPolicy|createWallet|\.create\s*\(|\.rpc\s*\(|signMessage|sendTransaction/u);
  });
});
