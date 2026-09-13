import type { Clock, IdGenerator, LLMProvider } from "./ports";
import { verifyProposalOrigin } from "./request-origin-guard";
import {
  IntentParseResultSchema,
  IntentProposalSchema,
  type IntentParseIssue,
  type IntentParseResult,
  type OriginClaims,
} from "../domain/intent-proposal";
import { AgentIntentSchema, SchemaVersion, UserRequestSchema, type UserRequest } from "../domain/schemas";

export interface IntentParserOptions {
  provider: LLMProvider;
  clock: Clock;
  idGenerator: IdGenerator;
  defaultMaxSlippageBps: number;
}

function issue(code: string, message: string, path = ""): IntentParseIssue {
  return { code, message, path };
}

function reject(
  request: UserRequest,
  options: IntentParserOptions,
  rejectionCode: "MODEL_REJECTED" | "MODEL_OUTPUT_INVALID" | "ORIGIN_MISMATCH" | "AMBIGUOUS_REQUEST" | "PROVIDER_ERROR",
  issues: IntentParseIssue[],
  parsedAt: string,
  originClaims: OriginClaims | null = null,
): IntentParseResult {
  return IntentParseResultSchema.parse({
    schemaVersion: SchemaVersion,
    requestId: request.requestId,
    parsedAt,
    providerId: options.provider.id,
    status: "rejected",
    rejectionCode,
    issues,
    originClaims,
  });
}

export async function parseUserRequest(rawRequest: UserRequest, options: IntentParserOptions): Promise<IntentParseResult> {
  const request = UserRequestSchema.parse(rawRequest);
  const parsedAt = options.clock.now();

  let rawProposal: unknown;
  try {
    rawProposal = await options.provider.parseIntent({
      requestId: request.requestId,
      userText: request.text,
      schemaVersion: SchemaVersion,
    });
  } catch {
    return reject(request, options, "PROVIDER_ERROR", [issue("PROVIDER_FAILURE", "intent provider failed without exposing provider response details")], parsedAt);
  }

  const proposalResult = IntentProposalSchema.safeParse(rawProposal);
  if (!proposalResult.success) {
    const issues = proposalResult.error.issues.map((item) => issue(`ZOD_${item.code.toUpperCase()}`, item.message, item.path.join(".")));
    return reject(request, options, "MODEL_OUTPUT_INVALID", issues, parsedAt);
  }

  const proposal = proposalResult.data;
  if (proposal.kind === "reject") {
    const rejectionCode = proposal.reason === "ambiguous_request" ? "AMBIGUOUS_REQUEST" : "MODEL_REJECTED";
    return reject(request, options, rejectionCode, [issue(`MODEL_${proposal.reason.toUpperCase()}`, "model classified the request as unsupported or unsafe to parse")], parsedAt);
  }

  const origin = verifyProposalOrigin(request.text, proposal);
  if (!origin.ok) {
    return reject(request, options, "ORIGIN_MISMATCH", origin.issues, parsedAt, origin.claims);
  }

  const intent = AgentIntentSchema.parse({
    schemaVersion: SchemaVersion,
    intentId: options.idGenerator.next(),
    requestId: request.requestId,
    action: "swap_exact_in",
    network: "monad-testnet",
    chainId: 10143,
    assetInSymbol: "USDC",
    assetOutSymbol: "MON",
    amountIn: proposal.amountIn,
    amountUnit: "asset_in",
    maxSlippageBps: proposal.maxSlippageBps ?? options.defaultMaxSlippageBps,
    ambiguity: "none",
    parsedAt,
  });

  return IntentParseResultSchema.parse({
    schemaVersion: SchemaVersion,
    requestId: request.requestId,
    parsedAt,
    providerId: options.provider.id,
    status: "accepted",
    intent,
    originClaims: origin.claims,
  });
}
