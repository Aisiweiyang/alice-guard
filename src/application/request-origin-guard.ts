import {
  OriginClaimsSchema,
  type OriginClaims,
  type SwapIntentProposal,
} from "../domain/intent-proposal";
import { compareUnsignedDecimals, normalizeUnsignedDecimal, toScaledInteger } from "../domain/canonicalize";

const SUPPORTED_ACTION = /\b(?:swap|buy|purchase|exchange)\b|购买|买入|买|兑换|交换/iu;
const CONFLICTING_ACTION = /\b(?:transfer|send|withdraw|bridge|lend|borrow|stake|approve|sell)\b|转账|发送|提现|跨链|借出|借入|质押|授权|卖出/iu;
const USDC = /\bUSDC\b/iu;
const MON = /\bMON\b/iu;
const USDC_AMOUNT = /\b((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)\s*USDC\b/giu;
const SLIPPAGE_BEFORE_PERCENT = /(?:slippage|滑点)[^0-9]{0,16}((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)\s*%/giu;
const PERCENT_BEFORE_SLIPPAGE = /\b((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)\s*%[^\r\n]{0,16}(?:slippage|滑点)/giu;

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function captureDecimals(pattern: RegExp, text: string): string[] {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].flatMap((match) => {
    const value = match[1];
    return value === undefined || !/[1-9]/.test(value) ? [] : [normalizeUnsignedDecimal(value)];
  });
}

function percentToBps(percent: string): number | null {
  try {
    const raw = toScaledInteger(percent, 2);
    return raw > 10_000n ? null : Number(raw);
  } catch {
    return null;
  }
}

export function extractOriginClaims(userText: string): OriginClaims {
  const amountCandidates = unique(captureDecimals(USDC_AMOUNT, userText));
  const slippagePercentCandidates = unique([
    ...captureDecimals(SLIPPAGE_BEFORE_PERCENT, userText),
    ...captureDecimals(PERCENT_BEFORE_SLIPPAGE, userText),
  ]);
  const slippageCandidatesBps = unique(
    slippagePercentCandidates.flatMap((candidate) => {
      const bps = percentToBps(candidate);
      return bps === null ? [] : [bps];
    }),
  );

  return OriginClaimsSchema.parse({
    supportedActionMentioned: SUPPORTED_ACTION.test(userText),
    conflictingActionMentioned: CONFLICTING_ACTION.test(userText),
    assetInMentioned: USDC.test(userText),
    assetOutMentioned: MON.test(userText),
    amountCandidates,
    slippageCandidatesBps,
  });
}

export interface OriginVerificationResult {
  ok: boolean;
  claims: OriginClaims;
  issues: Array<{ code: string; message: string; path: string }>;
}

export function verifyProposalOrigin(userText: string, proposal: SwapIntentProposal): OriginVerificationResult {
  const claims = extractOriginClaims(userText);
  const issues: OriginVerificationResult["issues"] = [];

  if (!claims.supportedActionMentioned) {
    issues.push({ code: "SUPPORTED_ACTION_NOT_FOUND", message: "the trusted user request does not explicitly request a supported swap/buy action", path: "action" });
  }
  if (claims.conflictingActionMentioned) {
    issues.push({ code: "CONFLICTING_ACTION_FOUND", message: "the trusted user request also mentions an unsupported state-changing action", path: "action" });
  }
  if (!claims.assetInMentioned || !claims.assetOutMentioned) {
    issues.push({ code: "REQUIRED_ASSETS_NOT_FOUND", message: "the trusted user request must explicitly name both USDC and MON", path: "assets" });
  }
  if (claims.amountCandidates.length !== 1) {
    issues.push({ code: "AMOUNT_AMBIGUOUS", message: "the trusted user request must contain exactly one positive USDC amount", path: "amountIn" });
  } else if (compareUnsignedDecimals(claims.amountCandidates[0]!, proposal.amountIn) !== 0) {
    issues.push({ code: "AMOUNT_ORIGIN_MISMATCH", message: "the proposed amount does not match the amount in the trusted user request", path: "amountIn" });
  }

  if (proposal.maxSlippageBps === null) {
    if (claims.slippageCandidatesBps.length > 0) {
      issues.push({ code: "SLIPPAGE_OMITTED", message: "the model omitted an explicit slippage limit from the trusted user request", path: "maxSlippageBps" });
    }
  } else if (claims.slippageCandidatesBps.length !== 1 || claims.slippageCandidatesBps[0] !== proposal.maxSlippageBps) {
    issues.push({ code: "SLIPPAGE_ORIGIN_MISMATCH", message: "the proposed slippage does not match a single explicit limit in the trusted user request", path: "maxSlippageBps" });
  }

  return { ok: issues.length === 0, claims, issues };
}
