import type { TransactionPlan } from "../../domain/schemas";
import type { ExecutionEnvelope } from "../../domain/execution-envelope";
import type {
  PrivyWalletBoundary,
  WalletAuthorizationPreparation,
  WalletSubmissionResult,
} from "./privy-client-port";
import { WalletPolicyVerificationSchema, type CompiledWalletPolicy, type WalletPolicyVerification } from "./privy-policy-schema";

export class DisabledPrivyWalletBoundary implements PrivyWalletBoundary {
  verifyPolicy(expected: CompiledWalletPolicy): Promise<WalletPolicyVerification> {
    return Promise.resolve(WalletPolicyVerificationSchema.parse({
      status: "NOT_CONFIGURED",
      expectedHash: expected.walletPolicyHash,
      observedHash: null,
      safeReason: "PRIVY_POLICY_NOT_CONFIGURED",
    }));
  }

  prepareAuthorization(envelope: ExecutionEnvelope, _plan: TransactionPlan): Promise<WalletAuthorizationPreparation> {
    return Promise.resolve({
      status: "denied",
      safeReason: "WALLET_BOUNDARY_DISABLED",
      envelopeHash: envelope.envelopeHash as `0x${string}`,
    });
  }

  submitValidatedPlan(_envelope: ExecutionEnvelope, _plan: TransactionPlan): Promise<WalletSubmissionResult> {
    return Promise.resolve({ status: "not_attempted", safeReason: "WALLET_BOUNDARY_DISABLED" });
  }
}
