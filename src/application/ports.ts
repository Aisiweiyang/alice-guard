export interface ParseIntentInput {
  requestId: string;
  userText: string;
  schemaVersion: string;
}

export interface LLMProvider {
  readonly id: string;
  parseIntent(input: ParseIntentInput): Promise<unknown>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(): string;
}
