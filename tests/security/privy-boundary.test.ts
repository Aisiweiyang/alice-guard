import { describe, expect, it } from "vitest";

import { DisabledPrivyWalletBoundary } from "../../src/adapters/privy/disabled-privy-client";
import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { verifyPrivyPolicy } from "../../src/adapters/privy/privy-policy-verifier";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";
import { createExecutionEnvelope } from "../../src/domain/execution-envelope";
import { hashCanonical } from "../../src/domain/hash";
import { createValidatedDemoPlan } from "../fixtures/phase4-fixtures";

describe("Privy boundary", () => {
  const expected = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);

  it("reports matched without returning the remote object", async () => {
    const secretBearingRemote = { ...expected.manifest, app_secret: "must-not-leak", wallet_id: "must-not-leak" };
    const result = await verifyPrivyPolicy(expected, { readPolicy: async () => secretBearingRemote }, "pol_example");
    expect(result.status).toBe("MATCHED");
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|wallet_id|app_secret/);
  });

  it("detects drift and fails provider errors closed with safe reasons", async () => {
    const drifted = await verifyPrivyPolicy(expected, {
      readPolicy: async () => ({ ...expected.manifest, name: "Mutated policy" }),
    }, "pol_example");
    expect(drifted.status).toBe("DRIFTED");

    const unavailable = await verifyPrivyPolicy(expected, {
      readPolicy: async () => { throw new Error("https://api.privy.io secret-token stack trace"); },
    }, "pol_example");
    expect(unavailable).toMatchObject({ status: "UNAVAILABLE", observedHash: null, safeReason: "PRIVY_POLICY_UNAVAILABLE" });
    expect(JSON.stringify(unavailable)).not.toMatch(/secret-token|api\.privy\.io|stack/);
  });

  it("keeps every disabled wallet operation non-executable", async () => {
    const { plan, intent } = await createValidatedDemoPlan();
    const envelope = createExecutionEnvelope({
      plan,
      intentHash: hashCanonical(intent),
      riskConfigHash: hashCanonical({ version: "risk.demo.v1" }),
      walletPolicyHash: expected.walletPolicyHash,
      executionNonce: "00000000-0000-4000-8000-000000009002",
      expiresAt: "2026-09-13T00:00:05.000Z",
    });
    const boundary = new DisabledPrivyWalletBoundary();
    expect((await boundary.verifyPolicy(expected)).status).toBe("NOT_CONFIGURED");
    expect((await boundary.prepareAuthorization(envelope, plan)).status).toBe("denied");
    expect((await boundary.submitValidatedPlan(envelope, plan)).status).toBe("not_attempted");
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(boundary))).not.toEqual(expect.arrayContaining([
      "signMessage", "signTypedData", "exportWallet", "exportPrivateKey", "sendArbitraryTransaction",
    ]));
  });
});
