import { createPrivateKey, createPublicKey } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { z } from "zod";

import { PrivyCuidSchema, type PrivyLiveEnvironment } from "../../config/privy-live";
import { hashCanonical } from "../../domain/hash";
import { Bytes32Schema, EvmAddressSchema } from "../../domain/schemas";
import type { PrivyPolicyManifest } from "./privy-policy-schema";
import { projectRemotePolicy } from "./privy-policy-verifier";
import { projectSafePrivyWallet, type SafePrivyWallet } from "./privy-wallet-client";

const RemoteKeyQuorumSchema = z.object({
  id: z.unknown(),
  authorization_threshold: z.unknown(),
  authorization_keys: z.unknown(),
  user_ids: z.unknown(),
  key_quorum_ids: z.unknown().optional(),
}).passthrough();

const RemoteAuthorizationKeySchema = z.object({ public_key: z.string().min(40).max(2_048) }).passthrough();

const SafePolicyResourceSchema = z.object({
  id: PrivyCuidSchema,
  ownerId: PrivyCuidSchema,
  policyHash: Bytes32Schema,
}).strict();

export type SafePolicyResource = z.infer<typeof SafePolicyResourceSchema>;

export interface CreatePrivyPolicyInput {
  manifest: PrivyPolicyManifest;
  ownerId: string;
  idempotencyKey: string;
}

export interface CreatePrivyWalletInput {
  displayName: string;
  externalId: string;
  ownerId: string;
  policyId: string;
  idempotencyKey: string;
}

export interface PrivyProvisioningPort {
  verifyOwnerKey(ownerId: string, authorizationPrivateKey: string): Promise<boolean>;
  createPolicy(input: CreatePrivyPolicyInput): Promise<unknown>;
  readPolicy(policyId: string): Promise<unknown>;
  createWallet(input: CreatePrivyWalletInput): Promise<unknown>;
  readWallet(walletId: string): Promise<unknown>;
}

function normalizeBase64(value: string): string {
  return value.replace(/\s+/gu, "").replace(/-/gu, "+").replace(/_/gu, "/").replace(/=+$/u, "");
}

function publicKeyFromAuthorizationPrivateKey(authorizationPrivateKey: string): string {
  const encoded = authorizationPrivateKey.replace(/^(?:wallet-auth|wallet-api):/u, "");
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  return createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
}

export function projectSafePolicyResource(candidate: unknown): SafePolicyResource {
  const resource = z.object({ id: z.unknown(), owner_id: z.unknown() }).passthrough().parse(candidate);
  return SafePolicyResourceSchema.parse({
    id: resource.id,
    ownerId: resource.owner_id,
    policyHash: hashCanonical(projectRemotePolicy(candidate)),
  });
}

export function projectCreatedWallet(candidate: unknown): SafePrivyWallet {
  const wallet = projectSafePrivyWallet(candidate);
  return z.object({
    id: PrivyCuidSchema,
    address: EvmAddressSchema,
    chainType: z.literal("ethereum"),
    ownerId: PrivyCuidSchema.nullable(),
    policyIds: z.array(PrivyCuidSchema).length(1),
    additionalSignerCount: z.literal(0),
    archived: z.literal(false),
  }).strict().parse(wallet);
}

export class PrivyNodeProvisioningClient implements PrivyProvisioningPort {
  readonly #client: PrivyClient;

  constructor(config: PrivyLiveEnvironment) {
    if (config.appId === null || config.appSecret === null) throw new Error("PRIVY_PROVISIONING_CLIENT_NOT_CONFIGURED");
    this.#client = new PrivyClient({ appId: config.appId, appSecret: config.appSecret });
  }

  async verifyOwnerKey(ownerId: string, authorizationPrivateKey: string): Promise<boolean> {
    const remote = RemoteKeyQuorumSchema.parse(await this.#client.keyQuorums().get(ownerId));
    const id = PrivyCuidSchema.parse(remote.id);
    z.literal(1).parse(remote.authorization_threshold);
    const keys = z.array(RemoteAuthorizationKeySchema).length(1).parse(remote.authorization_keys);
    z.union([z.null(), z.array(z.unknown()).length(0)]).parse(remote.user_ids);
    z.array(z.unknown()).length(0).parse(remote.key_quorum_ids ?? []);
    const expectedPublicKey = publicKeyFromAuthorizationPrivateKey(authorizationPrivateKey);
    return id === ownerId && normalizeBase64(keys[0]!.public_key) === normalizeBase64(expectedPublicKey);
  }

  createPolicy(input: CreatePrivyPolicyInput): Promise<unknown> {
    const sdkInput = {
      ...input.manifest,
      owner_id: input.ownerId,
      idempotency_key: input.idempotencyKey,
    } as Parameters<ReturnType<PrivyClient["policies"]>["create"]>[0];
    // The manifest has already passed Alice Guard's strict runtime schema. This
    // cast only narrows its ABI arrays to the SDK's generated viem ABI type.
    return this.#client.policies().create(sdkInput);
  }

  readPolicy(policyId: string): Promise<unknown> {
    return this.#client.policies().get(policyId);
  }

  createWallet(input: CreatePrivyWalletInput): Promise<unknown> {
    return this.#client.wallets().create({
      chain_type: "ethereum",
      display_name: input.displayName,
      external_id: input.externalId,
      owner_id: input.ownerId,
      policy_ids: [input.policyId],
      idempotency_key: input.idempotencyKey,
    });
  }

  readWallet(walletId: string): Promise<unknown> {
    return this.#client.wallets().get(walletId);
  }
}
