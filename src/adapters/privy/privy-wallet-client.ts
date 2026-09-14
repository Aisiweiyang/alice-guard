import { z } from "zod";

import { PrivyCuidSchema } from "../../config/privy-live";
import { EvmAddressSchema } from "../../domain/schemas";

export const SafePrivyWalletSchema = z
  .object({
    id: PrivyCuidSchema,
    address: EvmAddressSchema,
    chainType: z.literal("ethereum"),
    ownerId: PrivyCuidSchema.nullable(),
    policyIds: z.array(PrivyCuidSchema).max(1),
    additionalSignerCount: z.number().int().nonnegative().max(32),
    archived: z.boolean(),
  })
  .strict();

export type SafePrivyWallet = z.infer<typeof SafePrivyWalletSchema>;

const RemoteWalletSchema = z
  .object({
    id: z.unknown(),
    address: z.unknown(),
    chain_type: z.unknown(),
    owner_id: z.unknown(),
    policy_ids: z.unknown(),
    additional_signers: z.unknown(),
    archived_at: z.unknown().optional(),
  })
  .passthrough();

export interface PrivyWalletReader {
  readWallet(walletId: string): Promise<unknown>;
}

export interface PrivyWalletSdkLike {
  wallets(): {
    get(walletId: string): Promise<unknown>;
  };
}

export class PrivyNodeWalletReader implements PrivyWalletReader {
  readonly #client: PrivyWalletSdkLike;

  constructor(client: PrivyWalletSdkLike) {
    this.#client = client;
  }

  readWallet(walletId: string): Promise<unknown> {
    return this.#client.wallets().get(walletId);
  }
}

export function projectSafePrivyWallet(candidate: unknown): SafePrivyWallet {
  const remote = RemoteWalletSchema.parse(candidate);
  const signers = z.array(z.unknown()).max(32).parse(remote.additional_signers);
  return SafePrivyWalletSchema.parse({
    id: remote.id,
    address: remote.address,
    chainType: remote.chain_type,
    ownerId: remote.owner_id,
    policyIds: remote.policy_ids,
    additionalSignerCount: signers.length,
    archived: typeof remote.archived_at === "number",
  });
}
