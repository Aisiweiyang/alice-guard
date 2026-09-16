import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { SqliteAuditStore } from "../adapters/audit/sqlite-audit-store";
import { runDemoRequest } from "../application/demo-orchestrator";
import type { IdGenerator } from "../application/ports";
import {
  DisabledPrivyJudgeStatusProvider,
  type PrivyJudgeStatusProvider,
  unavailablePrivyJudgeStatus,
} from "../application/privy-judge-status";
import { createDemoDependencies, DEMO_SCENARIOS, type DemoScenario } from "../demo/demo-template";
import { toDemoPresentation } from "../ui/presentation";
import {
  DemoHealthSchema,
  DemoRunRequestSchema,
  SafeApiErrorSchema,
  SafeAuditSummarySchema,
  type DemoPresentation,
  type SafeAuditSummary,
} from "./api-schemas";

const MAX_REQUEST_BYTES = 2_048;

class RandomUuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

class RequestBodyError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface ApiReply {
  status: number;
  body: unknown;
}

function safeError(status: number, code: string, message: string): ApiReply {
  return { status, body: SafeApiErrorSchema.parse({ error: { code, message } }) };
}

function findScenario(name: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((scenario) => scenario.name === name);
}

export class DemoApiService {
  readonly #store: SqliteAuditStore;
  readonly #privyStatusProvider: PrivyJudgeStatusProvider;

  constructor(store: SqliteAuditStore, privyStatusProvider: PrivyJudgeStatusProvider = new DisabledPrivyJudgeStatusProvider()) {
    this.#store = store;
    this.#privyStatusProvider = privyStatusProvider;
  }

  health(): ApiReply {
    return {
      status: 200,
      body: DemoHealthSchema.parse({
        service: "alice-guard-demo",
        mode: "offline-demo-no-wallet",
        walletEnabled: false,
        signingEnabled: false,
        broadcastEnabled: false,
      }),
    };
  }

  scenarios(): ApiReply {
    return {
      status: 200,
      body: {
        scenarios: DEMO_SCENARIOS.map((scenario) => ({
          id: scenario.name,
          title: scenario.title,
          request: scenario.request.text,
        })),
      },
    };
  }

  audits(): ApiReply {
    const records: SafeAuditSummary[] = this.#store.list().map((record) => {
      const plan = record.transactionPlan;
      const status = plan !== null
        ? record.policyDecision?.decision === "require_approval" ? "requires_approval" : "prepared"
        : record.policyDecision?.decision === "deny" || record.parsedIntent === null ? "denied" : "recorded";
      return SafeAuditSummarySchema.parse({
        requestId: record.request.requestId,
        status,
        auditHash: record.recordHash,
        previousAuditHash: record.previousRecordHash,
        eventCount: record.events.length,
      });
    });
    return { status: 200, body: { chainValid: this.#store.verifyChain(), records } };
  }

  async privyStatus(): Promise<ApiReply> {
    try {
      return { status: 200, body: await this.#privyStatusProvider.read() };
    } catch {
      return { status: 200, body: unavailablePrivyJudgeStatus() };
    }
  }

  async run(candidate: unknown): Promise<ApiReply> {
    const parsed = DemoRunRequestSchema.safeParse(candidate);
    if (!parsed.success) return safeError(400, "INVALID_DEMO_REQUEST", "Request must contain one supported scenario only.");
    const scenario = findScenario(parsed.data.scenario);
    if (!scenario) return safeError(400, "UNKNOWN_SCENARIO", "The requested scenario is not available.");

    const request = { ...scenario.request, requestId: randomUUID() };
    try {
      const result = await runDemoRequest(
        request,
        createDemoDependencies(scenario, this.#store, new RandomUuidGenerator()),
      );
      return { status: 200, body: toDemoPresentation({ ...scenario, request }, result, this.#store.verifyChain()) };
    } catch {
      return safeError(500, "DEMO_EXECUTION_FAILED", "The demo failed closed. No transaction was attempted.");
    }
  }

  async dispatch(method: string, pathname: string, body?: unknown): Promise<ApiReply> {
    if (method === "GET" && pathname === "/api/health") return this.health();
    if (method === "GET" && pathname === "/api/scenarios") return this.scenarios();
    if (method === "GET" && pathname === "/api/audits") return this.audits();
    if (method === "GET" && pathname === "/api/privy/status") return this.privyStatus();
    if (method === "POST" && pathname === "/api/demo") return this.run(body);
    if (pathname.startsWith("/api/")) return safeError(404, "API_ROUTE_NOT_FOUND", "API route not found.");
    return safeError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new RequestBodyError(415, "CONTENT_TYPE_REQUIRED");
  }
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestBodyError(413, "REQUEST_TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new RequestBodyError(413, "REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (total === 0) throw new RequestBodyError(400, "REQUEST_BODY_REQUIRED");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestBodyError(400, "INVALID_JSON");
  }
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response: ServerResponse, reply: ApiReply): void {
  securityHeaders(response);
  response.statusCode = reply.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(reply.body)}\n`);
}

const STATIC_FILES: Readonly<Record<string, { file: string; contentType: string }>> = Object.freeze({
  "/": { file: "index.html", contentType: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", contentType: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", contentType: "text/javascript; charset=utf-8" },
});

export function createDemoHttpServer(service: DemoApiService, uiRoot = resolve("src", "ui")): Server {
  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    try {
      if (pathname.startsWith("/api/")) {
        const body = method === "POST" ? await readJsonBody(request) : undefined;
        sendJson(response, await service.dispatch(method, pathname, body));
        return;
      }
      if (method === "GET" && pathname === "/favicon.ico") {
        securityHeaders(response);
        response.statusCode = 204;
        response.end();
        return;
      }
      const staticFile = method === "GET" ? STATIC_FILES[pathname] : undefined;
      if (!staticFile) {
        sendJson(response, safeError(method === "GET" ? 404 : 405, "ROUTE_NOT_FOUND", "Route not found."));
        return;
      }
      const content = await readFile(resolve(uiRoot, staticFile.file));
      securityHeaders(response);
      response.statusCode = 200;
      response.setHeader("Content-Type", staticFile.contentType);
      response.end(content);
    } catch (error: unknown) {
      if (error instanceof RequestBodyError) {
        sendJson(response, safeError(error.status, error.code, "The request body was rejected."));
        return;
      }
      sendJson(response, safeError(500, "INTERNAL_DEMO_ERROR", "The demo failed closed."));
    }
  });
}

export async function listenOnLocalhost(server: Server, port: number): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("DEMO_SERVER_ADDRESS_UNAVAILABLE"));
        return;
      }
      resolvePromise(address.port);
    });
  });
}

export type { DemoPresentation };
