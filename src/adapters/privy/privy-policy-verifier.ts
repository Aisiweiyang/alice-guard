import { z } from "zod";

import { hashCanonical } from "../../domain/hash";
import type { PrivyPolicyReader } from "./privy-client-port";
import {
  PrivyPolicyManifestSchema,
  WalletPolicyVerificationSchema,
  type CompiledWalletPolicy,
  type PrivyPolicyManifest,
  type WalletPolicyVerification,
} from "./privy-policy-schema";

const RemotePolicySchema = z
  .object({
    version: z.unknown(),
    name: z.unknown(),
    chain_type: z.unknown(),
    rules: z.unknown(),
  })
  .passthrough();

function projectRemotePolicy(candidate: unknown): PrivyPolicyManifest {
  const remote = RemotePolicySchema.parse(candidate);
  return PrivyPolicyManifestSchema.parse({
    version: remote.version,
    name: remote.name,
    chain_type: remote.chain_type,
    rules: remote.rules,
  });
}
export async function verifyPrivyPolicy(
  expected: CompiledWalletPolicy,
  reader: PrivyPolicyReader | null,
  policyId: string | null,
): Promise<WalletPolicyVerification> {
  if (reader === null || policyId === null || policyId.trim().length === 0) {
    return WalletPolicyVerificationSchema.parse({
      status: "NOT_CONFIGURED",
      expectedHash: expected.walletPolicyHash,
      observedHash: null,
      safeReason: "PRIVY_POLICY_NOT_CONFIGURED",
    });
  }

  try {
    const observed = projectRemotePolicy(await reader.readPolicy(policyId));
    const observedHash = hashCanonical(observed);
    return WalletPolicyVerificationSchema.parse({
      status: observedHash === expected.walletPolicyHash ? "MATCHED" : "DRIFTED",
      expectedHash: expected.walletPolicyHash,
      observedHash,
      safeReason: observedHash === expected.walletPolicyHash ? "PRIVY_POLICY_MATCHED" : "PRIVY_POLICY_DRIFTED",
    });
  } catch {
    return WalletPolicyVerificationSchema.parse({
      status: "UNAVAILABLE",
      expectedHash: expected.walletPolicyHash,
      observedHash: null,
      safeReason: "PRIVY_POLICY_UNAVAILABLE",
    });
  }
}
