import { PrivyClient } from "@privy-io/node";
import { z } from "zod";

import type { PrivyLiveEnvironment } from "../../config/privy-live";
import { PrivyNodePolicyReader, type PrivyPolicyReader } from "./privy-client-port";
import { PrivyNodeWalletReader, type PrivyWalletReader } from "./privy-wallet-client";

const PrivyVerificationEnvironmentSchema = z
  .object({
    mode: z.enum(["disabled", "privy-verify"]),
    appId: z.string().min(1).max(256).nullable(),
    appSecret: z.string().min(1).max(1_024).nullable(),
    policyId: z.string().min(1).max(256).nullable(),
  })
  .strict();

export type PrivyVerificationEnvironment = z.infer<typeof PrivyVerificationEnvironmentSchema>;

export function readPrivyVerificationEnvironment(env: NodeJS.ProcessEnv): PrivyVerificationEnvironment {
  const mode = env["ALICE_GUARD_WALLET_MODE"] ?? "disabled";
  return PrivyVerificationEnvironmentSchema.parse({
    mode,
    appId: env["PRIVY_APP_ID"]?.trim() || null,
    appSecret: env["PRIVY_APP_SECRET"]?.trim() || null,
    policyId: env["PRIVY_POLICY_ID"]?.trim() || null,
  });
}
export function hasCompletePrivyVerificationCredentials(config: PrivyVerificationEnvironment): boolean {
  return config.mode === "privy-verify" && config.appId !== null && config.appSecret !== null && config.policyId !== null;
}

export async function loadPrivyPolicyReader(config: PrivyVerificationEnvironment): Promise<PrivyPolicyReader> {
  if (!hasCompletePrivyVerificationCredentials(config)) throw new Error("PRIVY_VERIFICATION_NOT_CONFIGURED");
  return new PrivyNodePolicyReader(new PrivyClient({ appId: config.appId!, appSecret: config.appSecret! }));
}

export function loadPrivyReadClients(config: PrivyLiveEnvironment): {
  policyReader: PrivyPolicyReader;
  walletReader: PrivyWalletReader;
} {
  if (config.appId === null || config.appSecret === null) throw new Error("PRIVY_READ_CLIENT_NOT_CONFIGURED");
  const client = new PrivyClient({ appId: config.appId, appSecret: config.appSecret });
  return {
    policyReader: new PrivyNodePolicyReader(client),
    walletReader: new PrivyNodeWalletReader(client),
  };
}
