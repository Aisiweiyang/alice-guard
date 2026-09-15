import { mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import {
  projectCreatedWallet,
  projectSafePolicyResource,
  type PrivyProvisioningPort,
} from "../adapters/privy/privy-provisioning-client";
import {
  PrivyDemoPublicStateSchema,
  type PrivyDemoPublicState,
  type PrivyPublicStateStore,
} from "../adapters/privy/privy-public-state";
import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";
import type { PrivyLiveEnvironment } from "../config/privy-live";
import { Bytes32Schema, EvmAddressSchema } from "../domain/schemas";
import { buildPrivySetupDryRunPlan } from "./privy-provisioning-plan";

const SafeProvisioningReasonSchema = z.enum([
  "PRIVY_PROVISION_MODE_REQUIRED",
  "PRIVY_PROVISION_CONFIGURATION_INCOMPLETE",
  "PRIVY_CONFIRMATION_HASH_MISMATCH",
  "PRIVY_OWNER_KEY_MISMATCH",
  "PRIVY_PUBLIC_STATE_CONFLICT",
  "PRIVY_POLICY_CREATE_FAILED",
  "PRIVY_POLICY_VERIFY_FAILED",
  "PRIVY_WALLET_CREATE_FAILED",
  "PRIVY_WALLET_VERIFY_FAILED",
  "PRIVY_PUBLIC_STATE_WRITE_FAILED",
  "PRIVY_PROVISIONING_LOCKED",
]);

export type SafeProvisioningReason = z.infer<typeof SafeProvisioningReasonSchema>;

export class PrivyProvisioningError extends Error {
  readonly safeReason: SafeProvisioningReason;

  constructor(safeReason: SafeProvisioningReason) {
    super(safeReason);
    this.name = "PrivyProvisioningError";
    this.safeReason = safeReason;
  }
}

export const PrivyProvisioningResultSchema = z.object({
  status: z.enum(["PROVISIONED", "ALREADY_PROVISIONED"]),
  policyId: z.string().length(24),
  walletId: z.string().length(24),
  walletAddress: EvmAddressSchema,
  ownerId: z.string().length(24),
  policyHash: Bytes32Schema,
  confirmationHash: Bytes32Schema,
  policyCreatedThisRun: z.boolean(),
  walletCreatedThisRun: z.boolean(),
  remoteMutationsPerformed: z.boolean(),
  signingPerformed: z.literal(false),
  broadcastPerformed: z.literal(false),
  walletFundingPerformed: z.literal(false),
}).strict();

export type PrivyProvisioningResult = z.infer<typeof PrivyProvisioningResultSchema>;

function assertStateMatchesPlan(state: PrivyDemoPublicState, ownerId: string, appIdFingerprint: string, policyHash: string): void {
  if (
    state.ownerId !== ownerId
    || state.appIdFingerprint !== appIdFingerprint
    || state.policyHash !== policyHash
    || state.chainId !== 10143
    || state.status === "REVOCATION_PLANNED"
    || state.status === "ARCHIVED"
  ) throw new PrivyProvisioningError("PRIVY_PUBLIC_STATE_CONFLICT");
}

async function writeState(store: PrivyPublicStateStore, state: PrivyDemoPublicState): Promise<void> {
  try {
    await store.write(PrivyDemoPublicStateSchema.parse(state));
  } catch {
    throw new PrivyProvisioningError("PRIVY_PUBLIC_STATE_WRITE_FAILED");
  }
}

export async function provisionPrivyDemoWallet(input: {
  config: PrivyLiveEnvironment;
  confirmationHash: string;
  client: PrivyProvisioningPort;
  store: PrivyPublicStateStore;
  now?: () => Date;
}): Promise<PrivyProvisioningResult> {
  const { config, client, store } = input;
  const now = input.now ?? (() => new Date());
  const plan = buildPrivySetupDryRunPlan(config);
  if (config.mode !== "privy-provision") throw new PrivyProvisioningError("PRIVY_PROVISION_MODE_REQUIRED");
  if (
    plan.status !== "READY_FOR_CONFIRMATION"
    || config.appId === null
    || config.authorizationKeyId === null
    || config.authorizationPrivateKey === null
    || plan.appIdFingerprint === null
  ) throw new PrivyProvisioningError("PRIVY_PROVISION_CONFIGURATION_INCOMPLETE");
  if (input.confirmationHash !== plan.confirmationHash) throw new PrivyProvisioningError("PRIVY_CONFIRMATION_HASH_MISMATCH");

  try {
    if (!await client.verifyOwnerKey(config.authorizationKeyId, config.authorizationPrivateKey)) {
      throw new PrivyProvisioningError("PRIVY_OWNER_KEY_MISMATCH");
    }
  } catch (error) {
    if (error instanceof PrivyProvisioningError) throw error;
    throw new PrivyProvisioningError("PRIVY_OWNER_KEY_MISMATCH");
  }

  const compiled = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
  let state = await store.read();
  if (state !== null) assertStateMatchesPlan(state, config.authorizationKeyId, plan.appIdFingerprint, compiled.walletPolicyHash);
  let policyCreatedThisRun = false;
  let walletCreatedThisRun = false;

  if (state === null) {
    let policy;
    try {
      policy = projectSafePolicyResource(await client.createPolicy({
        manifest: compiled.manifest,
        ownerId: config.authorizationKeyId,
        idempotencyKey: plan.policyCreateIdempotencyKey,
      }));
    } catch {
      throw new PrivyProvisioningError("PRIVY_POLICY_CREATE_FAILED");
    }
    if (policy.ownerId !== config.authorizationKeyId || policy.policyHash !== compiled.walletPolicyHash) {
      throw new PrivyProvisioningError("PRIVY_POLICY_VERIFY_FAILED");
    }
    const timestamp = now().toISOString();
    state = PrivyDemoPublicStateSchema.parse({
      schemaVersion: "phase4b.state.v1",
      revision: 1,
      status: "POLICY_CREATED",
      appIdFingerprint: plan.appIdFingerprint,
      policyHash: compiled.walletPolicyHash,
      policyId: policy.id,
      walletId: null,
      walletAddress: null,
      ownerId: config.authorizationKeyId,
      chainId: 10143,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await writeState(store, state);
    policyCreatedThisRun = true;
  }

  try {
    const observedPolicy = projectSafePolicyResource(await client.readPolicy(state.policyId));
    if (observedPolicy.ownerId !== config.authorizationKeyId || observedPolicy.policyHash !== compiled.walletPolicyHash) {
      throw new Error("drift");
    }
  } catch {
    throw new PrivyProvisioningError("PRIVY_POLICY_VERIFY_FAILED");
  }

  if (state.walletId === null || state.walletAddress === null) {
    let wallet;
    try {
      wallet = projectCreatedWallet(await client.createWallet({
        displayName: plan.walletDisplayName,
        externalId: plan.walletExternalId,
        ownerId: config.authorizationKeyId,
        policyId: state.policyId,
        idempotencyKey: plan.walletCreateIdempotencyKey,
      }));
    } catch {
      throw new PrivyProvisioningError("PRIVY_WALLET_CREATE_FAILED");
    }
    if (wallet.ownerId !== config.authorizationKeyId || wallet.policyIds[0] !== state.policyId) {
      throw new PrivyProvisioningError("PRIVY_WALLET_VERIFY_FAILED");
    }
    state = PrivyDemoPublicStateSchema.parse({
      ...state,
      revision: state.revision + 1,
      status: "WALLET_CREATED",
      walletId: wallet.id,
      walletAddress: wallet.address,
      updatedAt: now().toISOString(),
    });
    await writeState(store, state);
    walletCreatedThisRun = true;
  }

  const verifiedWalletId = z.string().length(24).parse(state.walletId);
  const verifiedWalletAddress = EvmAddressSchema.parse(state.walletAddress);
  try {
    const wallet = projectCreatedWallet(await client.readWallet(verifiedWalletId));
    if (wallet.address !== verifiedWalletAddress || wallet.ownerId !== config.authorizationKeyId || wallet.policyIds[0] !== state.policyId) {
      throw new Error("drift");
    }
  } catch {
    throw new PrivyProvisioningError("PRIVY_WALLET_VERIFY_FAILED");
  }

  if (state.status !== "VERIFIED") {
    state = PrivyDemoPublicStateSchema.parse({
      ...state,
      revision: state.revision + 1,
      status: "VERIFIED",
      updatedAt: now().toISOString(),
    });
    await writeState(store, state);
  }

  return PrivyProvisioningResultSchema.parse({
    status: policyCreatedThisRun || walletCreatedThisRun ? "PROVISIONED" : "ALREADY_PROVISIONED",
    policyId: state.policyId,
    walletId: verifiedWalletId,
    walletAddress: verifiedWalletAddress,
    ownerId: state.ownerId,
    policyHash: state.policyHash,
    confirmationHash: plan.confirmationHash,
    policyCreatedThisRun,
    walletCreatedThisRun,
    remoteMutationsPerformed: policyCreatedThisRun || walletCreatedThisRun,
    signingPerformed: false,
    broadcastPerformed: false,
    walletFundingPerformed: false,
  });
}

export async function withPrivyProvisioningLock<T>(operation: () => Promise<T>, path = resolve("data", "privy-provision.lock")): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch {
    throw new PrivyProvisioningError("PRIVY_PROVISIONING_LOCKED");
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(path).catch(() => undefined);
  }
}
