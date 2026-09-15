import { z } from "zod";

export const PrivyCuidSchema = z.string().length(24).regex(/^[a-zA-Z0-9]+$/, "invalid Privy resource ID");

const OptionalResourceIdSchema = PrivyCuidSchema.nullable();
const OptionalAppIdSchema = z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/).nullable();
const OptionalAppSecretSchema = z
  .string()
  .min(16)
  .max(2_048)
  .refine((value) => value === value.trim() && !value.includes("BEGIN "), "invalid secret format")
  .nullable();
const OptionalAuthorizationPrivateKeySchema = z
  .string()
  .min(28)
  .max(8_192)
  .regex(/^wallet-auth:[A-Za-z0-9+/]{16,}={0,2}$/, "expected a current Privy wallet-auth authorization key")
  .nullable();

export const PrivyLiveEnvironmentSchema = z
  .object({
    mode: z.enum(["disabled", "privy-verify", "privy-provision"]),
    appId: OptionalAppIdSchema,
    appSecret: OptionalAppSecretSchema,
    authorizationKeyId: OptionalResourceIdSchema,
    authorizationPrivateKey: OptionalAuthorizationPrivateKeySchema,
    policyId: OptionalResourceIdSchema,
    walletId: OptionalResourceIdSchema,
  })
  .strict();

export type PrivyLiveEnvironment = z.infer<typeof PrivyLiveEnvironmentSchema>;

const SETUP_VARIABLES = [
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AUTHORIZATION_KEY_ID",
  "PRIVY_AUTHORIZATION_PRIVATE_KEY",
] as const;

const VERIFY_VARIABLES = [
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AUTHORIZATION_KEY_ID",
  "PRIVY_POLICY_ID",
  "PRIVY_WALLET_ID",
] as const;

function optionalPublicValue(env: NodeJS.ProcessEnv, name: string): string | null {
  return env[name]?.trim() || null;
}

function optionalSecretValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name];
  return value === undefined || value.length === 0 ? null : value;
}

export function readPrivyLiveEnvironment(env: NodeJS.ProcessEnv): PrivyLiveEnvironment {
  return PrivyLiveEnvironmentSchema.parse({
    mode: env["ALICE_GUARD_WALLET_MODE"] ?? "disabled",
    appId: optionalPublicValue(env, "PRIVY_APP_ID"),
    appSecret: optionalSecretValue(env, "PRIVY_APP_SECRET"),
    authorizationKeyId: optionalPublicValue(env, "PRIVY_AUTHORIZATION_KEY_ID"),
    authorizationPrivateKey: optionalSecretValue(env, "PRIVY_AUTHORIZATION_PRIVATE_KEY"),
    policyId: optionalPublicValue(env, "PRIVY_POLICY_ID"),
    walletId: optionalPublicValue(env, "PRIVY_WALLET_ID"),
  });
}

export function missingPrivySetupVariables(config: PrivyLiveEnvironment): string[] {
  const values: Record<(typeof SETUP_VARIABLES)[number], string | null> = {
    PRIVY_APP_ID: config.appId,
    PRIVY_APP_SECRET: config.appSecret,
    PRIVY_AUTHORIZATION_KEY_ID: config.authorizationKeyId,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: config.authorizationPrivateKey,
  };
  return SETUP_VARIABLES.filter((name) => values[name] === null);
}

export function missingPrivyVerificationVariables(config: PrivyLiveEnvironment): string[] {
  const values: Record<(typeof VERIFY_VARIABLES)[number], string | null> = {
    PRIVY_APP_ID: config.appId,
    PRIVY_APP_SECRET: config.appSecret,
    PRIVY_AUTHORIZATION_KEY_ID: config.authorizationKeyId,
    PRIVY_POLICY_ID: config.policyId,
    PRIVY_WALLET_ID: config.walletId,
  };
  return VERIFY_VARIABLES.filter((name) => values[name] === null);
}
