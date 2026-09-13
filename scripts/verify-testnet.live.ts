import { expect, test } from "vitest";

import { ViemMonadReadClient, verifyMonadTestnetDeployment } from "../src/adapters/monad/read-only-client";
import { verifyKuruTestnetRegistry } from "../src/adapters/monad/registry-verifier";
import { KURU_TESTNET } from "../src/config/contracts";
import { MONAD_TESTNET } from "../src/config/networks";

test("configured Monad testnet and Kuru deployment pass read-only verification", async () => {
  const report = await verifyMonadTestnetDeployment(new ViemMonadReadClient());
  let registryResponse: Response;
  try {
    registryResponse = await fetch(KURU_TESTNET.registryHeadUrl, { signal: AbortSignal.timeout(20_000) });
  } catch (error: unknown) {
    throw new Error(`REGISTRY_FETCH_FAILED:${error instanceof Error ? error.name : "UNKNOWN"}`);
  }
  if (!registryResponse.ok) throw new Error(`REGISTRY_HTTP_ERROR:${registryResponse.status}`);
  const registryEntries = verifyKuruTestnetRegistry(await registryResponse.text());
  expect(report.chainId).toBe(MONAD_TESTNET.id);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "read-only",
        network: MONAD_TESTNET.network,
        rpc: MONAD_TESTNET.rpcUrl,
        router: KURU_TESTNET.router,
        market: KURU_TESTNET.monUsdcMarket,
        registryHead: KURU_TESTNET.registryHeadUrl,
        registryEntries,
        report,
      },
      null,
      2,
    )}\n`,
  );
});
