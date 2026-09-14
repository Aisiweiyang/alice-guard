import type { TransactionPlan } from "../../domain/schemas";
import type { ExecutionEnvelope } from "../../domain/execution-envelope";
import type { CompiledWalletPolicy, WalletPolicyVerification } from "./privy-policy-schema";

export interface PrivyPolicyReader {
  readPolicy(policyId: string): Promise<unknown>;
}
export interface WalletAuthorizationPreparation {
  status: "ready" | "denied";
  safeReason: string;
  envelopeHash: `0x${string}`;
}

export interface WalletSubmissionResult {
  status: "not_attempted" | "denied" | "unavailable";
  safeReason: string;
}

/**
 * Deliberately narrow: natural language, arbitrary RPCs, message signing and
 * key export do not have a representation at this boundary.
 */
export interface PrivyWalletBoundary {
  verifyPolicy(expected: CompiledWalletPolicy): Promise<WalletPolicyVerification>;
  prepareAuthorization(envelope: ExecutionEnvelope, plan: TransactionPlan): Promise<WalletAuthorizationPreparation>;
  submitValidatedPlan(envelope: ExecutionEnvelope, plan: TransactionPlan): Promise<WalletSubmissionResult>;
}

export interface PrivyNodeSdkLike {
  policies(): {
    get(policyId: string): Promise<unknown>;
  };
}

export class PrivyNodePolicyReader implements PrivyPolicyReader {
  readonly #client: PrivyNodeSdkLike;

  constructor(client: PrivyNodeSdkLike) {
    this.#client = client;
  }

  readPolicy(policyId: string): Promise<unknown> {
    return this.#client.policies().get(policyId);
  }
}
