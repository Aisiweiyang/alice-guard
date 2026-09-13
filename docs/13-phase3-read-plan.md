# Phase 3 — Monad Read/Plan Integration

Verification date: **2026-09-13, Asia/Shanghai**.

## Delivered

- Versioned Monad testnet, Kuru contract, and protocol-specific asset configuration.
- A read-only `viem` client with an immediate `eth_chainId` gate.
- Runtime checks for router/market/token bytecode and Kuru test USDC `symbol`/`decimals`.
- EIP-1967 proxy implementation discovery plus pinned proxy, implementation, and token code hashes.
- A live drift gate against the current Monad testnet protocol registry for Kuru's router, margin account, MON/USDC market, USDC, and OrderBook implementation.
- A Kuru market-data boundary that binds a symbol to exact market/token addresses and rejects mainnet/testnet confusion.
- Strict untrusted quote and price boundaries with request binding, freshness, and no unknown fields.
- Deterministic construction of exactly two transactions: exact ERC-20 approval and Kuru `anyToAnySwap` exact-input swap.
- Independent Plan Guard that decodes calldata and checks chain, wallet, policy/evidence hashes, router, token, spender, market, direction, native flags, amounts, minimum output, gas caps, quote expiry, and simulation binding.
- Offline attack tests for unknown calldata, changed wallet/policy/spender/market/amount/min-output, stale quotes, bad decimals, excessive gas, missing/mismatched simulations, and reverts.

No wallet client, private key, signer, raw-transaction submission, or broadcast method was added.

## Pinned sources

- Monad protocol registry commit: `6a7e204f4e428c31a12f8453f7966ddc59f24b1b`.
- Monad token-list commit: `01b6e7ef78632c6c99bb63af8b8b1543affad051`.
- Kuru SDK/ABI commit: `636509c2eafd63479d3f399703354e0d09f51e18`.
- Kuru public DEX contracts commit: `2060bb2736080c175d80d568bfdb6226bb5abd04`.

The executable configuration uses the Kuru testnet registry entry:

- Router: `0x7EFbE105Ca7415dE98F96622173458ac1c054630`
- MON/USDC market: `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9`
- Kuru test USDC: `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570`

The Kuru test USDC is deliberately identified as `monad-testnet:KURU-USDC`. It is not Circle's separately registered testnet USDC at `0x534b2f3A21130d7a60830c2Df862319e593943A3`. Symbol equality is never treated as asset identity.

The pinned live deployment identity is:

- Router proxy code hash: `0xae572ec3ca9b5f49c0364ca34edc5880b6b2837e47802e64e6b681bf2e74aa5c`
- Market proxy code hash: `0xae572ec3ca9b5f49c0364ca34edc5880b6b2837e47802e64e6b681bf2e74aa5c`
- Kuru USDC code hash: `0xefd6505dcba0cb3b3375320d8f1a4120291dd9f05fbbdc97a9b6fb1d0e3d719e`
- Router implementation: `0xaaa0f0c4d49d09ef33ae758d88afab810ecbe1ed`
- Router implementation code hash: `0xadf3e1f5d9bc07f55d68556f5cca8b9c68381716f932f9b49169e152690583b9`
- Market implementation: `0x72cae0a99c19b574e8a6de558f43fc1d019c9374`
- Market implementation code hash: `0x24c5974f233021f00d607bfa191d430f79565663fb90805ebcfca52de7333500`

These values are not silently refreshed. A legitimate upgrade causes `DEPLOYMENT_IDENTITY_MISMATCH` and requires explicit source review before repinning.

## Live read-only result

At block `62105950`, the public Monad testnet RPC returned:

- chain ID `10143`;
- non-empty bytecode at the configured router, market, and Kuru USDC addresses;
- Kuru USDC symbol `USDC` and decimals `6`;
- `bestBid = 2^256 - 1`, `bestAsk = 0`.

The last pair is treated as **no executable ask-side liquidity**, so Alice Guard cannot produce a truthful live USDC→MON quote or simulation at this checkpoint. It fails closed instead of inventing a price.

The same live run fetched Monad's current testnet registry head and matched all five pinned Kuru identities. This detects source-registry drift separately from on-chain bytecode drift.

## Public Kuru API network boundary

Kuru's documented market-data endpoint (`exchange.kuru.io/api/v3`) currently reports Monad **mainnet** markets. Its liquid `MON_USDC` entry uses market `0x065c9d28e428a0db40191a54d33d5b7c71a9c394` and USDC `0x754704bc059f8c67012fed69bc8a327a5aafb603`; these match Monad's mainnet registry, not the Phase 3 testnet configuration.

Alice Guard therefore never treats `MON_USDC` or any ticker symbol as network identity. The market-data boundary requires exact market, base-token, quote-token, and decimal matches and raises `MARKET_NETWORK_MISMATCH` otherwise. Unknown API fields are discarded rather than forwarded into trusted planning logic.

The official `Kuru-Labs/kuru-trading-skills` project was also reviewed. Alice Guard adopts its useful separation of quote/prepare concepts and tight asset allowlisting, but intentionally excludes its wallet binding, signing, and broadcast paths. API-produced arbitrary calldata is not admitted to the trusted plan; Alice Guard locally constructs and independently decodes known calls.

## ABI conflict found during live verification

Kuru's prose OrderBook page currently describes `bestBidAsk()` as returning `(uint32,uint32)`. The current official SDK ABI returns `(uint256,uint256)`, which matches the deployed contract's sentinel value. The first live probe intentionally failed under the prose ABI; the adapter was corrected to the pinned SDK ABI and the second probe passed.

The router's `anyToAnySwap` signature comes from the current Kuru router documentation. The official SDK package remains at `0.0.97`, depends on ethers `5.7.1`, and warns that development constants can change. Alice Guard therefore does not import the SDK into the trusted planning path; it uses a minimal locally declared ABI and independently decodes every transaction.

## Remaining Phase 3 gate

Phase 3 is **implemented but not fully cleared for live execution**:

1. A fresh nonzero Kuru testnet quote cannot be obtained while the configured market has no ask-side liquidity. The liquid public API market is mainnet and is correctly rejected.
2. Monad's documented public RPC exposes `eth_call` and `eth_estimateGas`, but not a documented sequential multi-transaction simulation API with state carried from approval into swap. Each simulation result is therefore bound and checked, but a production approval→swap sequence still needs a fork or verified simulator.
3. `anyToAnySwap` has no on-chain deadline parameter. Quote expiry is enforced off-chain and must be rechecked immediately before any later signing step.
4. No trustworthy live USD price source was configured for the protocol-specific test token. Tests use explicit fixtures only.

Phase 4 must not begin until a fresh quote and sequential simulation path are demonstrated, or the demo is explicitly kept offline.

## Commands

```powershell
pnpm check
pnpm test
pnpm verify:testnet
```

`verify:testnet` is read-only. It performs no wallet operation.
