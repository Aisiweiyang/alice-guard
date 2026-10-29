import { describe, expect, it, vi } from "vitest";

import {
  LLMProviderError,
  OpenAIResponsesProvider,
} from "../../src/adapters/llm/openai-responses-provider";

function successfulResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      status: "completed",
      output: [
        { type: "reasoning", id: "reasoning_test" },
        { type: "message", content: [{ type: "output_text", text }] },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("OpenAI Responses intent provider", () => {
  it("requests strict JSON without exposing tools", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => successfulResponse('{"kind":"swap_exact_in","amountIn":"20","maxSlippageBps":100,"reason":null}'));
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImplementation: fetchMock,
    });

    await expect(provider.parseIntent({ requestId: "request-1", userText: "Swap 20 USDC to MON", schemaVersion: "1.0.0" })).resolves.toEqual({
      kind: "swap_exact_in",
      amountIn: "20",
      maxSlippageBps: 100,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ store: false, tools: [], tool_choice: "none" });
    expect(body.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    const format = (body.text as { format: { schema: Record<string, unknown> } }).format;
    expect(format.schema).not.toHaveProperty("oneOf");
    expect(format.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["kind", "amountIn", "maxSlippageBps", "reason"],
    });
  });

  it("searches output items instead of assuming the first item is text", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImplementation: async () => successfulResponse('{"kind":"reject","amountIn":null,"maxSlippageBps":null,"reason":"unsupported_action"}'),
    });
    await expect(provider.parseIntent({ requestId: "request-1", userText: "transfer", schemaVersion: "1.0.0" })).resolves.toEqual({
      kind: "reject",
      reason: "unsupported_action",
    });
  });

  it("returns a sanitized typed HTTP error", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImplementation: async () => new Response("provider secret diagnostic", { status: 429 }),
    });
    await expect(provider.parseIntent({ requestId: "request-1", userText: "swap", schemaVersion: "1.0.0" })).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 429,
      message: "HTTP_ERROR",
    });
  });

  it("rejects ambiguous multiple output texts", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImplementation: async () =>
        new Response(JSON.stringify({
          id: "resp_test",
          status: "completed",
          output: [{ type: "message", content: [
            { type: "output_text", text: "{}" },
            { type: "output_text", text: "{}" },
          ] }],
        }), { status: 200 }),
    });
    await expect(provider.parseIntent({ requestId: "request-1", userText: "swap", schemaVersion: "1.0.0" })).rejects.toBeInstanceOf(LLMProviderError);
  });

  it("rejects internally inconsistent structured output", async () => {
    const provider = new OpenAIResponsesProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImplementation: async () => successfulResponse('{"kind":"reject","amountIn":"20","maxSlippageBps":null,"reason":"unsupported_action"}'),
    });
    await expect(provider.parseIntent({ requestId: "request-1", userText: "transfer", schemaVersion: "1.0.0" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects insecure non-local provider URLs", () => {
    expect(() => new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", baseUrl: "http://remote.example" })).toThrow("INSECURE_PROVIDER_URL");
  });

  it.each(["ftp://localhost/v1", "file://localhost/v1", "http://remote.example/v1"])("rejects unsafe protocol or host: %s", baseUrl => {
    expect(() => new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", baseUrl })).toThrow("INSECURE_PROVIDER_URL");
  });

  it.each(["https://user:pass@example.com/v1", "https://example.com/v1?key=value", "https://example.com/v1#fragment"])("rejects URL credentials or ambiguous suffixes: %s", baseUrl => {
    expect(() => new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", baseUrl })).toThrow("INVALID_PROVIDER_URL");
  });

  it.each([0, -1, NaN, Infinity, 60_001, 1.5])("rejects an unbounded timeout: %s", timeoutMs => {
    expect(() => new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", timeoutMs })).toThrow("INVALID_PROVIDER_TIMEOUT");
  });

  it.each(["http://localhost:8080/v1", "http://127.0.0.1:8080/v1", "http://[::1]:8080/v1", "https://example.com/v1"])("accepts a supported provider base: %s", baseUrl => {
    expect(() => new OpenAIResponsesProvider({ apiKey: "test-key", model: "test-model", baseUrl })).not.toThrow();
  });
});
