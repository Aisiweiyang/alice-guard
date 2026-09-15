import { describe, expect, it } from "vitest";

import type { PrivyPolicyReader } from "../../src/adapters/privy/privy-client-port";
import { PrivyPolicyManager } from "../../src/adapters/privy/privy-policy-manager";
import type { PrivyWalletReader } from "../../src/adapters/privy/privy-wallet-client";
import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";

const POLICY_ID = "p".repeat(24);
const WALLET_ID = "w".repeat(24);
const OWNER_ID = "o".repeat(24);
const ADDRESS = `0x${"12".repeat(20)}`;

function readers(walletOverrides: Record<string, unknown> = {}): [PrivyPolicyReader, PrivyWalletReader] {
  const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
  return [
    { readPolicy: async () => ({
      ...expected.manifest,
      app_secret: "must-not-project",
      rules: expected.manifest.rules.map((rule, index) => ({ ...rule, id: `server-rule-${index}` })),
    }) },
    {
      readWallet: async () => ({
        id: WALLET_ID,
        address: ADDRESS,
        chain_type: "ethereum",
        owner_id: OWNER_ID,
        policy_ids: [POLICY_ID],
        additional_signers: [],
        archived_at: undefined,
        authorization_private_key: "must-not-project",
        ...walletOverrides,
      }),
    },
  ];
}

describe("Privy policy and wallet binding verification", () => {
  const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);

  it("matches an exact policy, singleton binding and owner", async () => {
    const [policyReader, walletReader] = readers();
    const result = await new PrivyPolicyManager(policyReader, walletReader).verifyWalletBinding(expected, POLICY_ID, WALLET_ID, OWNER_ID);
    expect(result.status).toBe("MATCHED");
    expect(result.policyBound).toBe(true);
    expect(result.ownerMatched).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/secret|private.?key/iu);
  });

  it.each([
    ["wrong policy", { policy_ids: ["x".repeat(24)] }],
    ["wrong owner", { owner_id: "x".repeat(24) }],
    ["archived wallet", { archived_at: 1_789_000_000 }],
  ])("fails closed on %s", async (_label, override) => {
    const [policyReader, walletReader] = readers(override);
    const result = await new PrivyPolicyManager(policyReader, walletReader).verifyWalletBinding(expected, POLICY_ID, WALLET_ID, OWNER_ID);
    expect(result.status).toBe("DRIFTED");
  });

  it("returns a safe unavailable result when either provider read fails", async () => {
    const result = await new PrivyPolicyManager(
      { readPolicy: async () => { throw new Error("provider leaked secret"); } },
      { readWallet: async () => { throw new Error("provider leaked secret"); } },
    ).verifyWalletBinding(expected, POLICY_ID, WALLET_ID, OWNER_ID);
    expect(result.status).toBe("UNAVAILABLE");
    expect(JSON.stringify(result)).not.toContain("provider leaked secret");
  });
});
