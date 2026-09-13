import type { Clock, IdGenerator, LLMProvider } from "../../src/application/ports";
import type { UserRequest } from "../../src/domain/schemas";
import { INTENT_ID, NOW, REQUEST_ID } from "./evaluation-fixtures";

export function makeUserRequest(text: string): UserRequest {
  return {
    schemaVersion: "1.0.0",
    requestId: REQUEST_ID,
    userId: "demo-user",
    channel: "cli",
    text,
    receivedAt: NOW,
  };
}

export const fixedClock: Clock = { now: () => NOW };
export const fixedIdGenerator: IdGenerator = { next: () => INTENT_ID };

export function providerReturning(value: unknown): LLMProvider {
  return {
    id: "test-provider",
    parseIntent: async () => value,
  };
}

export function failingProvider(): LLMProvider {
  return {
    id: "test-provider",
    parseIntent: async () => {
      throw new Error("sensitive upstream body");
    },
  };
}
