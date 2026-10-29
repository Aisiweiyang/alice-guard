# Alice Guard — Product Vision

> 历史技术记录。当前入口与验证范围见 [文档索引](INDEX.md) 和 [验证记录](VALIDATION.md)。

## One-line definition

Alice Guard is a secure, auditable, least-privilege financial execution layer that lets an AI agent propose onchain actions without giving the model unrestricted wallet authority.

## Product thesis

AI agents are becoming capable of planning and acting, but unrestricted wallet access turns model error, prompt injection, application bugs, or infrastructure compromise into direct financial loss. Alice Guard inserts deterministic controls between AI reasoning and settlement:

```text
LLM proposes.
Deterministic code decides.
Wallet policy enforces.
Blockchain settles.
```

The model may translate natural language into a narrowly scoped intent. It may not choose arbitrary contract addresses, invent token identities, produce executable calldata, handle secrets, approve its own request, or bypass policy.

## Target user

The initial user is a developer operating a dedicated, low-balance agent wallet on Monad. The longer-term user is any person or application that wants an AI agent to perform financial actions under explicit, reviewable permissions.

## Core user promise

For every request, Alice Guard can answer:

1. What did the user ask?
2. What structured action did the model propose?
3. Which trusted data and configuration were used?
4. What risks were detected?
5. Which policy rules allowed, denied, or escalated the action?
6. What exact transaction was planned and validated?
7. Who approved it?
8. What happened onchain?

## Scope for the hackathon

Alice Guard is not a trading strategy, portfolio optimizer, generalized multisig, new oracle, new cryptographic wallet, or multi-chain automation platform. The hackathon product demonstrates one complete safety path for a Monad swap and two strong denial paths.

## Non-negotiable principles

- Deny by default.
- Least privilege and limited wallet balances.
- Deterministic security decisions from explicit inputs.
- No arbitrary LLM-generated calldata.
- No private key or seed phrase in model context, logs, source control, or client responses.
- Separate risk from policy.
- Revalidate after transaction planning and immediately before signing.
- Human approval for configured high-risk actions.
- Append-only, redacted audit records for every request, including failures.
- Fail closed when data, configuration, decoding, simulation, or dependencies are unavailable.

## Hackathon story

Alice Guard is best positioned as AI financial safety infrastructure, with onchain finance as the proof of utility:

> As agents gain wallets, the missing primitive is not another autonomous trader; it is a programmable safety boundary. Alice Guard lets AI propose economic actions while deterministic policy, wallet-level permissions, human approval, and auditable settlement retain control.

## Success criteria

The MVP is successful when a judge can see three flows:

- A small allowlisted USDC-to-MON swap progresses from request to a validated plan and, after the integration phase, a real low-value transaction.
- An over-limit swap is deterministically denied with the exact policy rule and evidence.
- A prompt-injection-style request cannot produce an executable transfer or arbitrary call and is denied before signing.

