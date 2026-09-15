import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type {
  CreatePrivyPolicyInput,
  CreatePrivyWalletInput,
  PrivyProvisioningPort,
} from "../../src/adapters/privy/privy-provisioning-client";
import { PrivyPublicStateStore } from "../../src/adapters/privy/privy-public-state";
import {
  PrivyProvisioningError,
  provisionPrivyDemoWallet,
} from "../../src/application/privy-live-provisioning";
import { buildPrivySetupDryRunPlan } from "../../src/application/privy-provisioning-plan";
import { PrivyLiveEnvironmentSchema } from "../../src/config/privy-live";

const POLICY_ID = "p".repeat(24);
const WALLET_ID = "w".repeat(24);
const OWNER_ID = "o".repeat(24);
const WALLET_ADDRESS = `0x${"12".repeat(20)}`;
const TEST_KEY = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
const PRIVATE_KEY = `wallet-auth:${TEST_KEY.export({ format: "der", type: "pkcs8" }).toString("base64")}`;

const config = PrivyLiveEnvironmentSchema.parse({
  mode: "privy-provision",
  appId: "alice-hackathon-test",
  appSecret: "privy_app_secret_testonly123456789",
  authorizationKeyId: OWNER_ID,
  authorizationPrivateKey: PRIVATE_KEY,
  policyId: null,
  walletId: null,
});

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

class FakeProvisioningPort implements PrivyProvisioningPort {
  ownerMatches = true;
  policyCreates = 0;
  walletCreates = 0;
  readonly calls: string[] = [];
  policyInput: CreatePrivyPolicyInput | null = null;
  walletInput: CreatePrivyWalletInput | null = null;

  async verifyOwnerKey(): Promise<boolean> {
    this.calls.push("verify-owner");
    return this.ownerMatches;
  }

  async createPolicy(input: CreatePrivyPolicyInput): Promise<unknown> {
    this.calls.push("create-policy");
    this.policyCreates += 1;
    this.policyInput = input;
    return this.policyResponse();
  }

  async readPolicy(): Promise<unknown> {
    this.calls.push("read-policy");
    return this.policyResponse();
  }

  async createWallet(input: CreatePrivyWalletInput): Promise<unknown> {
    this.calls.push("create-wallet");
    this.walletCreates += 1;
    this.walletInput = input;
    return this.walletResponse();
  }

  async readWallet(): Promise<unknown> {
    this.calls.push("read-wallet");
    return this.walletResponse();
  }

  private policyResponse(): unknown {
    if (this.policyInput === null) throw new Error("policy missing");
    return {
      id: POLICY_ID,
      owner_id: this.policyInput.ownerId,
      created_at: 1,
      ...this.policyInput.manifest,
      rules: this.policyInput.manifest.rules.map((rule, index) => ({ ...rule, id: `rule-${index}` })),
    };
  }

  private walletResponse(): unknown {
    if (this.walletInput === null) throw new Error("wallet missing");
    return {
      id: WALLET_ID,
      address: WALLET_ADDRESS,
      chain_type: "ethereum",
      owner_id: this.walletInput.ownerId,
      policy_ids: [this.walletInput.policyId],
      additional_signers: [],
      archived_at: null,
    };
  }
}

async function stateStore(): Promise<{ store: PrivyPublicStateStore; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "alice-privy-provision-"));
  directories.push(directory);
  const path = join(directory, "state.json");
  return { store: new PrivyPublicStateStore(path), path };
}

describe("Privy live provisioning state machine", () => {
  it("creates one policy and one empty wallet, verifies both, and persists no secret", async () => {
    const client = new FakeProvisioningPort();
    const { store, path } = await stateStore();
    const plan = buildPrivySetupDryRunPlan(config);
    const result = await provisionPrivyDemoWallet({
      config,
      confirmationHash: plan.confirmationHash,
      client,
      store,
      now: () => new Date("2026-09-15T08:00:00.000Z"),
    });

    expect(result.status).toBe("PROVISIONED");
    expect(result.policyCreatedThisRun).toBe(true);
    expect(result.walletCreatedThisRun).toBe(true);
    expect(result.signingPerformed).toBe(false);
    expect(result.broadcastPerformed).toBe(false);
    expect(result.walletFundingPerformed).toBe(false);
    expect(client.calls).toEqual(["verify-owner", "create-policy", "read-policy", "create-wallet", "read-wallet"]);
    expect(client.policyCreates).toBe(1);
    expect(client.walletCreates).toBe(1);
    expect(client.policyInput?.ownerId).toBe(OWNER_ID);
    expect(client.walletInput?.policyId).toBe(POLICY_ID);
    expect(client.walletInput?.ownerId).toBe(OWNER_ID);
    const serialized = await readFile(path, "utf8");
    expect(serialized).not.toContain(config.appSecret);
    expect(serialized).not.toContain(config.authorizationPrivateKey);
    expect((await store.read())?.status).toBe("VERIFIED");
  });

  it("is idempotent after verified public state", async () => {
    const client = new FakeProvisioningPort();
    const { store } = await stateStore();
    const confirmationHash = buildPrivySetupDryRunPlan(config).confirmationHash;
    await provisionPrivyDemoWallet({ config, confirmationHash, client, store });
    const second = await provisionPrivyDemoWallet({ config, confirmationHash, client, store });
    expect(second.status).toBe("ALREADY_PROVISIONED");
    expect(second.remoteMutationsPerformed).toBe(false);
    expect(client.policyCreates).toBe(1);
    expect(client.walletCreates).toBe(1);
  });

  it("rejects a stale confirmation before any provider operation", async () => {
    const client = new FakeProvisioningPort();
    const { store } = await stateStore();
    await expect(provisionPrivyDemoWallet({ config, confirmationHash: `0x${"00".repeat(32)}`, client, store }))
      .rejects.toMatchObject<Partial<PrivyProvisioningError>>({ safeReason: "PRIVY_CONFIRMATION_HASH_MISMATCH" });
    expect(client.calls).toEqual([]);
  });

  it("rejects a private key that does not match the configured owner before creation", async () => {
    const client = new FakeProvisioningPort();
    client.ownerMatches = false;
    const { store } = await stateStore();
    const confirmationHash = buildPrivySetupDryRunPlan(config).confirmationHash;
    await expect(provisionPrivyDemoWallet({ config, confirmationHash, client, store }))
      .rejects.toMatchObject<Partial<PrivyProvisioningError>>({ safeReason: "PRIVY_OWNER_KEY_MISMATCH" });
    expect(client.calls).toEqual(["verify-owner"]);
    expect(client.policyCreates).toBe(0);
    expect(client.walletCreates).toBe(0);
  });
});
