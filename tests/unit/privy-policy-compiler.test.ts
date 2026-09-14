import { describe, expect, it } from "vitest";

import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { PrivyPolicyManifestSchema } from "../../src/adapters/privy/privy-policy-schema";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";

describe("Privy policy compiler", () => {
  it("is deterministic and contains no wildcard or broad signing method", () => {
    const first = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    const second = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    expect(first.walletPolicyHash).toBe(second.walletPolicyHash);
    expect(first.manifest.rules).toHaveLength(2);
    expect(first.manifest.rules.every((rule) => rule.method === "eth_sendTransaction")).toBe(true);
    expect(JSON.stringify(first.manifest)).not.toContain('"method":"*"');
    expect(JSON.stringify(first.manifest)).not.toMatch(/signMessage|signTypedData|exportPrivateKey|7702/);
  });

  it("pins chain, targets, zero native value, spender and raw amount caps", () => {
    const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    const serialized = JSON.stringify(compiled.manifest);
    for (const expected of [
      "chain_id",
      "10143",
      DEFAULT_WALLET_POLICY_CONFIG.tokenAddress,
      DEFAULT_WALLET_POLICY_CONFIG.routerAddress,
      DEFAULT_WALLET_POLICY_CONFIG.marketAddress,
      "approve.spender",
      "approve.amount",
      "anyToAnySwap.amount",
      DEFAULT_WALLET_POLICY_CONFIG.maxInputRaw,
    ]) expect(serialized).toContain(String(expected));
    expect(compiled.manifest.rules.every((rule) => rule.conditions.some((condition) => condition.field === "value" && condition.value === "0"))).toBe(true);
  });

  it("labels every critical boundary as Privy-enforced or application-only", () => {
    const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
    expect(compiled.coverage).toHaveLength(15);
    expect(compiled.coverage.some((entry) => entry.enforcement === "UNSUPPORTED")).toBe(false);
    expect(compiled.coverage.find((entry) => entry.rule === "rolling_spend")?.enforcement).toBe("APP_ONLY");
    expect(compiled.coverage.find((entry) => entry.rule === "key_export")?.enforcement).toBe("PRIVY_ENFORCED");
  });

  it("rejects wildcard and unknown-method manifests", () => {
    const valid = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG).manifest;
    expect(PrivyPolicyManifestSchema.safeParse({ ...valid, rules: [{ ...valid.rules[0], method: "*" }] }).success).toBe(false);
    expect(PrivyPolicyManifestSchema.safeParse({ ...valid, rules: [{ ...valid.rules[0], method: "eth_signTypedData_v4" }] }).success).toBe(false);
  });
});
