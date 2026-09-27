import type { DemoRunResult } from "../application/demo-orchestrator";
import { compilePrivyPolicy } from "../adapters/privy/privy-policy-compiler";
import { DEFAULT_WALLET_POLICY_CONFIG } from "../config/wallet-policy";
import type { DemoScenario } from "../demo/demo-template";
import { DemoPresentationSchema, type DemoPresentation } from "../server/api-schemas";

function stringArgument(value: unknown): string | null {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? value : null;
}

export function toDemoPresentation(
  scenario: DemoScenario,
  result: DemoRunResult,
  auditChainValid: boolean,
): DemoPresentation {
  const walletPolicy = compilePrivyPolicy(DEFAULT_WALLET_POLICY_CONFIG);
  const transactions = result.plan?.transactions.map((transaction) => {
    const args = transaction.decodedCall.arguments;
    const approval = transaction.purpose === "approve_exact";
    const amountRaw = stringArgument(args["amountRaw"]);
    if (amountRaw === null) throw new Error("PRESENTATION_TRANSACTION_AMOUNT_INVALID");
    const spender = approval ? String(args["spender"] ?? "") : null;
    const markets = approval ? null : args["marketAddresses"];
    const market = Array.isArray(markets) && typeof markets[0] === "string" ? markets[0] : null;
    const minAmountOutRaw = approval ? null : stringArgument(args["minAmountOutRaw"]);
    return {
      sequence: transaction.sequence,
      purpose: transaction.purpose,
      target: transaction.to,
      gasLimit: transaction.gasLimit,
      explanation: approval
        ? "Approve exactly the requested USDC amount for the allowlisted Kuru router."
        : "Swap the exact USDC input through the allowlisted MON/USDC market with a minimum output bound.",
      spender,
      market,
      amountRaw,
      minAmountOutRaw,
    };
  }) ?? [];

  const intentAccepted = result.audit.parsedIntent !== null;
  const policy = result.policyEvaluation;
  return DemoPresentationSchema.parse({
    proof: result.proof ? {
      capsule: result.proof.candidate.capsule, verification: result.proof.verification,
      provenance: result.proof.candidate.material.provenance,
      limitation: `UNATTESTED offline fixture, evaluated at fixed demo time ${result.proof.options.now}, not the current clock. Hashes commit to data; they do not authenticate its source. Checks are relative to server-pinned context. Manifest coverage is not a verified Privy binding. No signing, broadcast, or execution authorization.`,
    } : null,
    scenario: scenario.name,
    title: scenario.title,
    request: scenario.request.text,
    mode: "offline-demo-no-wallet",
    status: result.status,
    stoppedAt: result.stage,
    intent: result.audit.parsedIntent === null ? null : {
      action: result.audit.parsedIntent.action,
      amountIn: result.audit.parsedIntent.amountIn,
      assetIn: result.audit.parsedIntent.assetInSymbol,
      assetOut: result.audit.parsedIntent.assetOutSymbol,
      maxSlippageBps: result.audit.parsedIntent.maxSlippageBps,
    },
    risk: result.riskAssessment === null ? null : {
      score: result.riskAssessment.score,
      level: result.riskAssessment.level,
      reasons: result.riskAssessment.reasons.map((reason) => ({
        code: reason.code,
        severity: reason.severity,
        message: reason.message,
      })),
    },
    policy: policy === null ? null : {
      decision: policy.decision.decision,
      reasons: policy.decision.reasons.map((reason) => ({ code: reason.code, severity: null, message: reason.message })),
      trace: policy.trace,
    },
    plan: result.plan === null ? null : {
      planHash: result.plan.planHash,
      validated: true,
      transactionCount: result.plan.transactions.length,
      transactions,
    },
    walletPolicy: {
      status: "NOT_CONFIGURED",
      walletPolicyHash: walletPolicy.walletPolicyHash,
      mode: "offline-manifest-only",
      coverage: walletPolicy.coverage.map(({ rule, enforcement }) => ({ rule, enforcement })),
    },
    checks: {
      intentAccepted,
      evidenceCollected: result.audit.evidence.length > 0,
      riskEvaluated: result.riskAssessment !== null,
      policyEvaluated: policy !== null,
      planCreated: result.plan !== null,
      planValidated: result.plan?.status === "validated",
    },
    reasonCodes: result.reasonCodes,
    audit: {
      auditHash: result.audit.recordHash,
      previousAuditHash: result.audit.previousRecordHash,
      chainValid: auditChainValid,
      events: result.audit.events.map((event) => ({
        type: event.type,
        actor: event.actor,
        safeSummary: event.safeSummary,
      })),
    },
    execution: "not_attempted",
    capabilities: { wallet: false, signing: false, broadcast: false },
  });
}
