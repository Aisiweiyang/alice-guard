# Phase 2 Implementation: Agent Intent Parser

Status: **complete locally; live provider credentials intentionally not configured**.

## Implemented boundary

```text
authenticated UserRequest text
          |
          v
LLMProvider.parseIntent() -> unknown
          |
          v
IntentProposal Zod schema
          |
          v
Request Origin Guard
  - supported action appears in user text
  - USDC and MON appear in user text
  - proposed amount exactly matches one user-text amount
  - proposed slippage exactly matches one user-text percentage
  - conflicting state-changing actions reject
          |
          v
system constructs AgentIntent
  - action fixed to swap_exact_in
  - direction fixed to USDC -> MON
  - network fixed to Monad testnet / 10143
  - IDs and timestamp supplied by trusted application code
```

The model controls only `amountIn` and an explicitly stated optional slippage value. It cannot choose a chain, address, token direction, recipient, contract, ABI, calldata, signer, policy, ID, or timestamp.

## Why an Origin Guard exists

Structured Output proves that model output has a shape; it does not prove the values came from the user's request. A compromised model could emit a valid-looking `200 USDC` proposal when the user asked for `20 USDC`.

The deterministic Origin Guard compares execution-sensitive proposed fields against values extracted from the authenticated user text. Unsupported wording produces rejection/clarification instead of a guessed transaction. This is a deliberately narrow implementation of the provenance principles studied in CaMeL and ROPE.

## Provider architecture

`LLMProvider` is a two-method contract: a stable provider identifier and `parseIntent(input): Promise<unknown>`. The application does not import a provider SDK.

The first adapter targets the OpenAI Responses API through an injected `fetch` implementation:

- Requests `text.format.type = json_schema` with `strict = true`.
- Uses a root object with every field required and nullable unused fields. Official OpenAI documentation states that root schemas cannot be `anyOf`, all fields must be required, and `additionalProperties: false` is mandatory.
- Sends no tools and sets `tool_choice: none`.
- Sets `store: false`.
- Scans all response output items for exactly one `output_text` item instead of assuming the first output item is the answer.
- Applies local Zod validation after JSON parsing even when Structured Outputs is requested.
- Normalizes HTTP, timeout, malformed, incomplete, and ambiguous-output errors without returning provider bodies or credentials.
- Rejects non-HTTPS remote base URLs; localhost HTTP remains available for test doubles.

Official references:

- [Create a model response](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Structured model outputs and supported schema subset](https://developers.openai.com/api/docs/guides/structured-outputs)

## Test coverage

- English and Chinese supported requests.
- Explicit and default slippage.
- Decimal percentages below 1%.
- Model-invented amount or slippage.
- Missing assets/action and ambiguous multiple amounts.
- Prompt injection containing transfer instructions.
- Extra calldata/unknown fields.
- Explicit model rejection.
- Provider error redaction.
- Responses output traversal, invalid/multiple output, HTTP failure, insecure URL, and Structured Output schema shape.

## Remaining before any live model call

1. Select an exact model available to the project owner's API account.
2. Supply credentials through a process secret, never source code or a committed `.env`.
3. Run a small live conformance corpus and record latency, cost, valid-schema rate, false rejection rate, and Origin Guard mismatch rate.
4. Keep live model tests opt-in; unit and security tests remain fully offline.

No live model call is required to begin Phase 3 read-only Monad integration, but a live conformance run should occur before the final demo.
