import { describe, expect, it, vi } from "vitest";

import type { WalletBalanceReader } from "../../src/adapters/monad/wallet-balance-reader";
import type { PrivyDemoPublicState } from "../../src/adapters/privy/privy-public-state";
import type { PrivyWalletBindingVerification } from "../../src/adapters/privy/privy-policy-manager";
import {
  DisabledPrivyJudgeStatusProvider,
  LivePrivyJudgeStatusProvider,
  type WalletBindingVerifier,
} from "../../src/application/privy-judge-status";
import type { PrivyLiveEnvironment } from "../../src/config/privy-live";
import { compilePrivyPolicy } from "../../src/adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../../src/config/wallet-policy";
import { hashCanonical } from "../../src/domain/hash";

const POLICY_ID = "p".repeat(24);
const WALLET_ID = "w".repeat(24);
const OWNER_ID = "o".repeat(24);
const ADDRESS = `0x${"12".repeat(20)}`;
const APP_ID = "alice-test-app";
const NOW = new Date("2026-09-15T14:00:00.000Z");
const policy = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);

function environment(): PrivyLiveEnvironment {
  return {
    mode: "disabled",
    appId: APP_ID,
    appSecret: "s".repeat(32),
    authorizationKeyId: OWNER_ID,
    authorizationPrivateKey: null,
    policyId: null,
    walletId: null,
  };
}

function state(overrides: Partial<PrivyDemoPublicState> = {}): PrivyDemoPublicState {
  return {
    schemaVersion: "phase4b.state.v1",
    revision: 3,
    status: "VERIFIED",
    appIdFingerprint: hashCanonical({ appId: APP_ID }),
    policyHash: policy.walletPolicyHash,
    policyId: POLICY_ID,
    walletId: WALLET_ID,
    walletAddress: ADDRESS,
    ownerId: OWNER_ID,
    chainId: 10143,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function binding(overrides: Partial<PrivyWalletBindingVerification> = {}): PrivyWalletBindingVerification {
  return {
    status: "MATCHED",
    expectedPolicyHash: policy.walletPolicyHash,
    observedPolicyHash: policy.walletPolicyHash,
    walletId: WALLET_ID,
    walletAddress: ADDRESS,
    policyBound: true,
    ownerMatched: true,
    archived: false,
    safeReason: "PRIVY_WALLET_BINDING_MATCHED",
    ...overrides,
  };
}

function balances(): WalletBalanceReader {
  return {
    read: vi.fn(async () => ({
      chainId: 10143 as const,
      blockNumber: "62771953",
      nativeBalanceRaw: "0",
      usdcBalanceRaw: "0",
    })),
  };
}

describe("Privy judge status", () => {
  it("returns a stable disabled projection without a wallet capability", async () => {
    const result = await new DisabledPrivyJudgeStatusProvider(() => NOW).read();
    expect(result).toMatchObject({
      mode: "disabled",
      status: "NOT_CONFIGURED",
      wallet: null,
      capabilities: { walletProvisioned: false, signing: false, broadcast: false, funding: false },
    });
  });

  it("combines public state, remote binding and same-block balances into safe evidence", async () => {
    const verifier: WalletBindingVerifier = { verifyWalletBinding: vi.fn(async () => binding()) };
    const provider = new LivePrivyJudgeStatusProvider({
      store: { read: async () => state() },
      environment: environment(),
      bindingVerifier: verifier,
      balanceReader: balances(),
      now: () => NOW,
    });
    const result = await provider.read();
    expect(result).toMatchObject({
      mode: "live-read-only",
      status: "VERIFIED",
      wallet: { id: WALLET_ID, address: ADDRESS, ownerId: OWNER_ID, archived: false },
      policy: { id: POLICY_ID, bound: true, ownerMatched: true },
      balances: { nativeBalanceRaw: "0", tokenBalanceRaw: "0" },
      liveChecks: { publicState: "MATCHED", remoteBinding: "MATCHED", onchainBalances: "MATCHED" },
      capabilities: { walletProvisioned: true, signing: false, broadcast: false, funding: false },
    });
    expect(JSON.stringify(result)).not.toMatch(/appSecret|privateKey|authorizationPrivateKey|s{32}/u);
  });

  it("fails closed before remote verification when public state drifts", async () => {
    const verifyWalletBinding = vi.fn(async () => binding());
    const provider = new LivePrivyJudgeStatusProvider({
      store: { read: async () => state({ policyHash: hashCanonical("drift") }) },
      environment: environment(),
      bindingVerifier: { verifyWalletBinding },
      balanceReader: balances(),
      now: () => NOW,
    });
    const result = await provider.read();
    expect(result.status).toBe("DEGRADED");
    expect(result.liveChecks).toMatchObject({ publicState: "DRIFTED", remoteBinding: "NOT_CONFIGURED" });
    expect(verifyWalletBinding).not.toHaveBeenCalled();
  });

  it("reports provider timeout without exposing the underlying error", async () => {
    const never = new Promise<PrivyWalletBindingVerification>(() => undefined);
    const provider = new LivePrivyJudgeStatusProvider({
      store: { read: async () => state() },
      environment: environment(),
      bindingVerifier: { verifyWalletBinding: async () => never },
      balanceReader: balances(),
      now: () => NOW,
      timeoutMs: 1,
    });
    const result = await provider.read();
    expect(result).toMatchObject({
      status: "DEGRADED",
      liveChecks: { publicState: "MATCHED", remoteBinding: "UNAVAILABLE", onchainBalances: "MATCHED" },
      safeReason: "PRIVY_LIVE_STATUS_UNAVAILABLE",
    });
  });

  it("caches the safe projection for the configured interval", async () => {
    const verifyWalletBinding = vi.fn(async () => binding());
    const balanceReader = balances();
    const provider = new LivePrivyJudgeStatusProvider({
      store: { read: vi.fn(async () => state()) },
      environment: environment(),
      bindingVerifier: { verifyWalletBinding },
      balanceReader,
      now: () => NOW,
      cacheTtlMs: 15_000,
    });
    expect(await provider.read()).toEqual(await provider.read());
    expect(verifyWalletBinding).toHaveBeenCalledTimes(1);
    expect(balanceReader.read).toHaveBeenCalledTimes(1);
  });
});
