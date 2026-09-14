import { z } from "zod";

import { PrivyCuidSchema } from "../../config/privy-live";
import { Bytes32Schema, EvmAddressSchema, IdentSchema } from "../../domain/schemas";
import type { PrivyPolicyReader } from "./privy-client-port";
import type { CompiledWalletPolicy } from "./privy-policy-schema";
import { verifyPrivyPolicy } from "./privy-policy-verifier";
import { projectSafePrivyWallet, type PrivyWalletReader } from "./privy-wallet-client";

export const PrivyWalletBindingVerificationSchema = z
  .object({
    status: z.enum(["MATCHED", "DRIFTED", "NOT_CONFIGURED", "UNAVAILABLE"]),
    expectedPolicyHash: Bytes32Schema,
    observedPolicyHash: Bytes32Schema.nullable(),
    walletId: PrivyCuidSchema.nullable(),
    walletAddress: EvmAddressSchema.nullable(),
    policyBound: z.boolean(),
    ownerMatched: z.boolean(),
    archived: z.boolean(),
    safeReason: IdentSchema,
  })
  .strict();

export type PrivyWalletBindingVerification = z.infer<typeof PrivyWalletBindingVerificationSchema>;

export class PrivyPolicyManager {
  readonly #policyReader: PrivyPolicyReader;
  readonly #walletReader: PrivyWalletReader;

  constructor(policyReader: PrivyPolicyReader, walletReader: PrivyWalletReader) {
    this.#policyReader = policyReader;
    this.#walletReader = walletReader;
  }

  async verifyWalletBinding(
    expected: CompiledWalletPolicy,
    policyId: string | null,
    walletId: string | null,
    expectedOwnerId: string | null,
  ): Promise<PrivyWalletBindingVerification> {
    if (policyId === null || walletId === null || expectedOwnerId === null) {
      return PrivyWalletBindingVerificationSchema.parse({
        status: "NOT_CONFIGURED",
        expectedPolicyHash: expected.walletPolicyHash,
        observedPolicyHash: null,
        walletId: null,
        walletAddress: null,
        policyBound: false,
        ownerMatched: false,
        archived: false,
        safeReason: "PRIVY_WALLET_NOT_CONFIGURED",
      });
    }

    try {
      const [policy, wallet] = await Promise.all([
        verifyPrivyPolicy(expected, this.#policyReader, policyId),
        this.#walletReader.readWallet(walletId).then(projectSafePrivyWallet),
      ]);
      const policyBound = wallet.policyIds.length === 1 && wallet.policyIds[0] === policyId;
      const ownerMatched = wallet.ownerId === expectedOwnerId;
      const matched = policy.status === "MATCHED" && policyBound && ownerMatched && !wallet.archived;
      return PrivyWalletBindingVerificationSchema.parse({
        status: matched ? "MATCHED" : "DRIFTED",
        expectedPolicyHash: expected.walletPolicyHash,
        observedPolicyHash: policy.observedHash,
        walletId: wallet.id,
        walletAddress: wallet.address,
        policyBound,
        ownerMatched,
        archived: wallet.archived,
        safeReason: matched ? "PRIVY_WALLET_BINDING_MATCHED" : "PRIVY_WALLET_BINDING_DRIFTED",
      });
    } catch {
      return PrivyWalletBindingVerificationSchema.parse({
        status: "UNAVAILABLE",
        expectedPolicyHash: expected.walletPolicyHash,
        observedPolicyHash: null,
        walletId: null,
        walletAddress: null,
        policyBound: false,
        ownerMatched: false,
        archived: false,
        safeReason: "PRIVY_WALLET_BINDING_UNAVAILABLE",
      });
    }
  }
}
