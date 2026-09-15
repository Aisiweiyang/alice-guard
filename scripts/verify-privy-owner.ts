import { PrivyNodeProvisioningClient } from "../src/adapters/privy/privy-provisioning-client";
import { missingPrivySetupVariables, readPrivyLiveEnvironment } from "../src/config/privy-live";

function providerStatus(error: unknown): number | null {
  if (error !== null && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" && Number.isInteger(status) ? status : null;
  }
  return null;
}

function safeProviderReason(status: number | null): string {
  if (status === 401) return "PRIVY_APP_CREDENTIALS_REJECTED";
  if (status === 403) return "PRIVY_OWNER_READ_FORBIDDEN";
  if (status === 404) return "PRIVY_OWNER_ID_NOT_FOUND";
  if (status === 429) return "PRIVY_OWNER_READ_RATE_LIMITED";
  return "PRIVY_OWNER_VERIFICATION_UNAVAILABLE";
}

try {
  const config = readPrivyLiveEnvironment(process.env);
  const missingEnvironment = missingPrivySetupVariables(config);
  if (missingEnvironment.length > 0 || config.authorizationKeyId === null || config.authorizationPrivateKey === null) {
    process.stdout.write(`${JSON.stringify({
      status: "NOT_CONFIGURED",
      missingEnvironment,
      safeReason: "PRIVY_OWNER_VERIFICATION_NOT_CONFIGURED",
      remoteMutationsPerformed: false,
      signingPerformed: false,
      broadcastPerformed: false,
    }, null, 2)}\n`);
  } else {
    const matched = await new PrivyNodeProvisioningClient(config).verifyOwnerKey(
      config.authorizationKeyId,
      config.authorizationPrivateKey,
    );
    process.stdout.write(`${JSON.stringify({
      status: matched ? "MATCHED" : "DRIFTED",
      ownerId: config.authorizationKeyId,
      safeReason: matched ? "PRIVY_OWNER_KEY_MATCHED" : "PRIVY_OWNER_KEY_DRIFTED",
      remoteMutationsPerformed: false,
      signingPerformed: false,
      broadcastPerformed: false,
    }, null, 2)}\n`);
    if (!matched) process.exitCode = 1;
  }
} catch (error) {
  const status = providerStatus(error);
  process.stdout.write(`${JSON.stringify({
    status: "UNAVAILABLE",
    providerStatus: status,
    safeReason: safeProviderReason(status),
    remoteMutationsPerformed: false,
    signingPerformed: false,
    broadcastPerformed: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
