const CONFIRMATION_PREFIX = "--confirmation-hash=";
const LOWERCASE_BYTES32_PATTERN = /^0x[0-9a-f]{64}$/u;

export type PrivyProvisioningArguments =
  | { allowed: true; confirmationHash: string }
  | { allowed: false; confirmationHash: "" };

export function parsePrivyProvisioningArguments(rawArguments: readonly string[]): PrivyProvisioningArguments {
  const arguments_ = rawArguments[0] === "--" ? rawArguments.slice(1) : [...rawArguments];
  const applyArguments = arguments_.filter((argument) => argument === "--apply");
  const confirmationArguments = arguments_.filter((argument) => argument.startsWith(CONFIRMATION_PREFIX));
  const allArgumentsKnown = arguments_.every(
    (argument) => argument === "--apply" || argument.startsWith(CONFIRMATION_PREFIX),
  );
  const confirmationHash = confirmationArguments[0]?.slice(CONFIRMATION_PREFIX.length) ?? "";

  if (
    !allArgumentsKnown
    || applyArguments.length !== 1
    || confirmationArguments.length !== 1
    || !LOWERCASE_BYTES32_PATTERN.test(confirmationHash)
  ) {
    return { allowed: false, confirmationHash: "" };
  }

  return { allowed: true, confirmationHash };
}
