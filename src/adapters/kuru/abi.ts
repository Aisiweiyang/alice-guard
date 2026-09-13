import { parseAbi } from "viem";

export const erc20ReadAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const kuruRouterAbi = parseAbi([
  "function anyToAnySwap(address[] marketAddresses, bool[] isBuy, bool[] nativeSend, address debitToken, address creditToken, uint256 amount, uint256 minAmountOut) payable returns (uint256 amountOut)",
]);

export const kuruOrderBookReadAbi = parseAbi([
  // The current SDK ABI returns uint256. The prose docs still say uint32.
  "function bestBidAsk() view returns (uint256 bestBid, uint256 bestAsk)",
]);
