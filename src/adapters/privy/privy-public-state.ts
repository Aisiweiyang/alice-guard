import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { PrivyCuidSchema } from "../../config/privy-live";
import { Bytes32Schema, EvmAddressSchema, IsoDateTimeSchema } from "../../domain/schemas";

export const PrivyDemoPublicStateSchema = z
  .object({
    schemaVersion: z.literal("phase4b.state.v1"),
    revision: z.number().int().nonnegative(),
    status: z.enum(["POLICY_CREATED", "WALLET_CREATED", "VERIFIED", "REVOCATION_PLANNED", "ARCHIVED"]),
    appIdFingerprint: Bytes32Schema,
    policyHash: Bytes32Schema,
    policyId: PrivyCuidSchema,
    walletId: PrivyCuidSchema.nullable(),
    walletAddress: EvmAddressSchema.nullable(),
    ownerId: PrivyCuidSchema,
    chainId: z.literal(10143),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const needsWallet = value.status !== "POLICY_CREATED";
    if (needsWallet && (value.walletId === null || value.walletAddress === null)) {
      context.addIssue({ code: "custom", path: ["walletId"], message: "wallet identifiers required after policy creation" });
    }
    if ((value.walletId === null) !== (value.walletAddress === null)) {
      context.addIssue({ code: "custom", path: ["walletAddress"], message: "wallet ID and address must be set together" });
    }
  });

export type PrivyDemoPublicState = z.infer<typeof PrivyDemoPublicStateSchema>;

const FORBIDDEN_KEY_PATTERN = /(?:secret|private.?key|seed|mnemonic|signature|authorization.?context|jwt|token)/iu;
const FORBIDDEN_VALUE_PATTERN = /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\b(?:seed phrase|mnemonic)\b/iu;

export function assertPublicStateContainsNoSecrets(candidate: unknown): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEY_PATTERN.test(key)) throw new Error("PRIVY_PUBLIC_STATE_FORBIDDEN_KEY");
        visit(nested);
      }
      return;
    }
    if (typeof value === "string" && FORBIDDEN_VALUE_PATTERN.test(value)) {
      throw new Error("PRIVY_PUBLIC_STATE_FORBIDDEN_VALUE");
    }
  };
  visit(candidate);
}

export class PrivyPublicStateStore {
  readonly #path: string;

  constructor(path = resolve("data", "privy-demo-state.json")) {
    this.#path = resolve(path);
  }

  get path(): string {
    return this.#path;
  }

  async read(): Promise<PrivyDemoPublicState | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#path, "utf8"));
      assertPublicStateContainsNoSecrets(parsed);
      return PrivyDemoPublicStateSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write(state: PrivyDemoPublicState): Promise<void> {
    assertPublicStateContainsNoSecrets(state);
    const validated = PrivyDemoPublicStateSchema.parse(state);
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, this.#path);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
