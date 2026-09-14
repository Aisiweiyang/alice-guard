import { z } from "zod";

import { PrivyNodePolicyReader, type PrivyNodeSdkLike, type PrivyPolicyReader } from "./privy-client-port";

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
  const moduleSpecifier = "@privy-io/node";
  const loaded = await import(moduleSpecifier) as Record<string, unknown>;
  const Constructor = loaded["PrivyClient"] as (new (options: { appId: string; appSecret: string }) => PrivyNodeSdkLike) | undefined;
  if (!Constructor) throw new Error("PRIVY_SDK_CONSTRUCTOR_UNAVAILABLE");
  return new PrivyNodePolicyReader(new Constructor({ appId: config.appId!, appSecret: config.appSecret! }));
}
