import {
  createPublicClient,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { erc20ReadAbi, kuruOrderBookReadAbi } from "../kuru/abi";
import { KURU_TESTNET } from "../../config/contracts";
import { KURU_TESTNET_USDC } from "../../config/assets";
import { MONAD_TESTNET } from "../../config/networks";
import type { PlannedTransaction } from "../../domain/schemas";
import type { SimulationResult } from "../../domain/planning";

export interface MonadDeploymentReport {
  chainId: number;
  routerHasCode: boolean;
  marketHasCode: boolean;
  usdcHasCode: boolean;
  routerCodeHash: Hex;
  marketCodeHash: Hex;
  usdcCodeHash: Hex;
  routerImplementation: Address | null;
  marketImplementation: Address | null;
  routerImplementationCodeHash: Hex | null;
  marketImplementationCodeHash: Hex | null;
  usdcSymbol: string;
  usdcDecimals: number;
  bestBid: string;
  bestAsk: string;
  hasQuotedLiquidity: boolean;
  blockNumber: string;
}

export interface DeploymentIdentity {
  routerProxyCodeHash: Hex;
  marketProxyCodeHash: Hex;
  usdcCodeHash: Hex;
  routerImplementation: Address | null;
  marketImplementation: Address | null;
  routerImplementationCodeHash: Hex | null;
  marketImplementationCodeHash: Hex | null;
}

export interface MonadReadPort {
  getChainId(): Promise<number>;
  getBytecode(address: Address): Promise<Hex | undefined>;
  getStorageAt(address: Address, slot: Hex): Promise<Hex | undefined>;
  readErc20Symbol(address: Address): Promise<string>;
  readErc20Decimals(address: Address): Promise<number>;
  readBestBidAsk(address: Address): Promise<readonly [bigint, bigint]>;
  getBlockNumber(): Promise<bigint>;
  simulate(transaction: PlannedTransaction, account: Address): Promise<SimulationResult>;
}

const monadTestnetChain = {
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: { default: { http: [MONAD_TESTNET.rpcUrl] } },
} as const;

export class ViemMonadReadClient implements MonadReadPort {
  readonly #client: PublicClient;

  constructor(rpcUrl = MONAD_TESTNET.rpcUrl) {
    this.#client = createPublicClient({
      chain: monadTestnetChain,
      transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
    });
  }

  async getChainId(): Promise<number> {
    return this.#client.getChainId();
  }

  async getBytecode(address: Address): Promise<Hex | undefined> {
    return this.#client.getBytecode({ address });
  }

  async getStorageAt(address: Address, slot: Hex): Promise<Hex | undefined> {
    return this.#client.getStorageAt({ address, slot });
  }

  async readErc20Symbol(address: Address): Promise<string> {
    return this.#client.readContract({ address, abi: erc20ReadAbi, functionName: "symbol" });
  }

  async readErc20Decimals(address: Address): Promise<number> {
    return this.#client.readContract({ address, abi: erc20ReadAbi, functionName: "decimals" });
  }

  async readBestBidAsk(address: Address): Promise<readonly [bigint, bigint]> {
    return this.#client.readContract({ address, abi: kuruOrderBookReadAbi, functionName: "bestBidAsk" });
  }

  async getBlockNumber(): Promise<bigint> {
    return this.#client.getBlockNumber();
  }

  async simulate(transaction: PlannedTransaction, account: Address): Promise<SimulationResult> {
    const blockNumber = await this.#client.getBlockNumber();
    try {
      await this.#client.call({
        account,
        to: transaction.to as Address,
        data: transaction.data as Hex,
        value: BigInt(transaction.valueRaw),
        blockNumber,
      });
      const gas = await this.#client.estimateGas({
        account,
        to: transaction.to as Address,
        data: transaction.data as Hex,
        value: BigInt(transaction.valueRaw),
        blockNumber,
      });
      return {
        sequence: transaction.sequence,
        to: transaction.to,
        valueRaw: transaction.valueRaw,
        dataHash: keccak256(transaction.data as Hex),
        gasUsedRaw: gas.toString(),
        blockNumber: blockNumber.toString(),
        success: true,
        revertReason: null,
      };
    } catch (error: unknown) {
      return {
        sequence: transaction.sequence,
        to: transaction.to,
        valueRaw: transaction.valueRaw,
        dataHash: keccak256(transaction.data as Hex),
        gasUsedRaw: "0",
        blockNumber: blockNumber.toString(),
        success: false,
        revertReason: error instanceof Error ? error.name : "SIMULATION_ERROR",
      };
    }
  }
}

function hasCode(bytecode: Hex | undefined): boolean {
  return bytecode !== undefined && bytecode !== "0x";
}

export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

function implementationFromSlot(value: Hex | undefined): Address | null {
  if (!value || BigInt(value) === 0n) return null;
  return `0x${value.slice(-40)}` as Address;
}

export async function verifyMonadTestnetDeployment(
  client: MonadReadPort,
  expectedIdentity: DeploymentIdentity = KURU_TESTNET.codeIdentity,
): Promise<MonadDeploymentReport> {
  const usdc = KURU_TESTNET_USDC;
  if (usdc.kind !== "erc20") {
    throw new Error("INVALID_ASSET_CONFIGURATION");
  }

  const chainId = await client.getChainId();
  if (chainId !== MONAD_TESTNET.id) {
    throw new Error(`WRONG_CHAIN:${chainId}`);
  }

  const [
    routerCode,
    marketCode,
    usdcCode,
    routerImplementationSlot,
    marketImplementationSlot,
    usdcSymbol,
    usdcDecimals,
    bestBidAsk,
    blockNumber,
  ] = await Promise.all([
    client.getBytecode(KURU_TESTNET.router),
    client.getBytecode(KURU_TESTNET.monUsdcMarket),
    client.getBytecode(usdc.address as Address),
    client.getStorageAt(KURU_TESTNET.router, EIP1967_IMPLEMENTATION_SLOT),
    client.getStorageAt(KURU_TESTNET.monUsdcMarket, EIP1967_IMPLEMENTATION_SLOT),
    client.readErc20Symbol(usdc.address as Address),
    client.readErc20Decimals(usdc.address as Address),
    client.readBestBidAsk(KURU_TESTNET.monUsdcMarket),
    client.getBlockNumber(),
  ]);

  if (!hasCode(routerCode) || !hasCode(marketCode) || !hasCode(usdcCode)) {
    throw new Error("CONFIGURED_CONTRACT_HAS_NO_CODE");
  }
  if (usdcSymbol !== usdc.symbol || usdcDecimals !== usdc.decimals) {
    throw new Error(`ASSET_METADATA_MISMATCH:${usdcSymbol}:${usdcDecimals}`);
  }

  const routerImplementation = implementationFromSlot(routerImplementationSlot);
  const marketImplementation = implementationFromSlot(marketImplementationSlot);
  const [routerImplementationCode, marketImplementationCode] = await Promise.all([
    routerImplementation ? client.getBytecode(routerImplementation) : Promise.resolve(undefined),
    marketImplementation ? client.getBytecode(marketImplementation) : Promise.resolve(undefined),
  ]);
  if (
    (routerImplementation !== null && !hasCode(routerImplementationCode)) ||
    (marketImplementation !== null && !hasCode(marketImplementationCode))
  ) {
    throw new Error("PROXY_IMPLEMENTATION_HAS_NO_CODE");
  }

  const report: MonadDeploymentReport = {
    chainId,
    routerHasCode: true,
    marketHasCode: true,
    usdcHasCode: true,
    routerCodeHash: keccak256(routerCode!),
    marketCodeHash: keccak256(marketCode!),
    usdcCodeHash: keccak256(usdcCode!),
    routerImplementation,
    marketImplementation,
    routerImplementationCodeHash: routerImplementationCode ? keccak256(routerImplementationCode) : null,
    marketImplementationCodeHash: marketImplementationCode ? keccak256(marketImplementationCode) : null,
    usdcSymbol,
    usdcDecimals,
    bestBid: bestBidAsk[0].toString(),
    bestAsk: bestBidAsk[1].toString(),
    hasQuotedLiquidity: bestBidAsk[1] > 0n && bestBidAsk[1] < (1n << 256n) - 1n,
    blockNumber: blockNumber.toString(),
  };

  const expected = expectedIdentity;
  const mismatches = [
    ["routerProxyCodeHash", report.routerCodeHash, expected.routerProxyCodeHash],
    ["marketProxyCodeHash", report.marketCodeHash, expected.marketProxyCodeHash],
    ["usdcCodeHash", report.usdcCodeHash, expected.usdcCodeHash],
    ["routerImplementation", report.routerImplementation?.toLowerCase() ?? null, expected.routerImplementation?.toLowerCase() ?? null],
    ["marketImplementation", report.marketImplementation?.toLowerCase() ?? null, expected.marketImplementation?.toLowerCase() ?? null],
    ["routerImplementationCodeHash", report.routerImplementationCodeHash, expected.routerImplementationCodeHash],
    ["marketImplementationCodeHash", report.marketImplementationCodeHash, expected.marketImplementationCodeHash],
  ].filter(([, actual, pinned]) => actual !== pinned);
  if (mismatches.length > 0) {
    throw new Error(`DEPLOYMENT_IDENTITY_MISMATCH:${mismatches.map(([name]) => name).join(",")}`);
  }

  return report;
}
