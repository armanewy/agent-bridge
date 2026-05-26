import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { HostedPlannerReviewResponse, HostedPlannerTaskSpecResponse } from "@agentbridge/core";

export interface CloudConfig {
  port: number;
  openAiApiKeyConfigured: boolean;
  logRawPayloads: boolean;
  maxPlannerPayloadBytes: number;
}

export interface CloudRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface CloudResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface RequestLogEntry {
  requestId: string;
  route: string;
  userId?: string;
  status: number;
  timestamp: string;
}

const DEV_USER = {
  id: "user_dev",
  email: "dev@agentbridge.local"
};

export class AgentBridgeCloudApp {
  private readonly requestLogs: RequestLogEntry[] = [];
  private readonly usage: Array<Record<string, unknown>> = [];
  private readonly devTokens = new Set<string>();

  constructor(private readonly config: CloudConfig = loadConfig()) {}

  getRequestLogs(): RequestLogEntry[] {
    return [...this.requestLogs];
  }

  async handle(request: CloudRequest): Promise<CloudResponse> {
    const requestId = `req_${randomUUID()}`;
    const route = `${request.method.toUpperCase()} ${request.path}`;
    let status = 404;
    let userId: string | undefined;
    try {
      const method = request.method.toUpperCase();
      if (method === "GET" && request.path === "/health") {
        status = 200;
        return { status, body: { ok: true, requestId } };
      }
      if (method === "POST" && request.path === "/v1/auth/session/dev-login") {
        const token = `dev_${randomUUID()}`;
        this.devTokens.add(token);
        userId = DEV_USER.id;
        status = 200;
        return { status, body: { token, user: DEV_USER, requestId } };
      }
      if (method === "POST" && request.path === "/v1/auth/session/logout") {
        const token = bearerToken(request.headers);
        if (token) {
          this.devTokens.delete(token);
        }
        status = 200;
        return { status, body: { ok: true, requestId } };
      }

      const auth = this.requireAuth(request);
      userId = auth.userId;

      if (method === "GET" && request.path === "/v1/me") {
        status = 200;
        return { status, body: { user: DEV_USER, requestId } };
      }
      if (method === "GET" && request.path === "/v1/usage/me") {
        status = 200;
        return { status, body: { usage: this.usage, requestId } };
      }
      if (method === "POST" && request.path === "/v1/planner/sessions") {
        this.ensurePlannerPayloadAllowed(request.body);
        const sessionId = `planner_session_${randomUUID()}`;
        status = 200;
        this.recordUsage(userId, request.path, status, request.body);
        return { status, body: { sessionId, createdAt: now(), metadata: { mocked: true }, requestId } };
      }
      const messageMatch = request.path.match(/^\/v1\/planner\/sessions\/([^/]+)\/messages$/);
      if (method === "POST" && messageMatch) {
        this.ensurePlannerPayloadAllowed(request.body);
        status = 200;
        this.recordUsage(userId, request.path, status, request.body);
        return {
          status,
          body: {
            sessionId: messageMatch[1],
            turnId: `turn_${randomUUID()}`,
            content: "Mock planner response: create a scoped, verifiable TaskSpec.",
            createdAt: now(),
            metadata: { mocked: true },
            requestId
          }
        };
      }
      if (method === "POST" && request.path === "/v1/planner/task-spec") {
        this.ensurePlannerPayloadAllowed(request.body);
        status = 200;
        const response: HostedPlannerTaskSpecResponse = {
          taskSpec: mockTaskSpec(),
          requestId,
          createdAt: now(),
          metadata: { mocked: true }
        };
        this.recordUsage(userId, request.path, status, request.body);
        return { status, body: response };
      }
      if (method === "POST" && request.path === "/v1/planner/review") {
        this.ensurePlannerPayloadAllowed(request.body);
        status = 200;
        const response: HostedPlannerReviewResponse = {
          reviewSummary: "Mock review: continue only if verification is actionable.",
          statusSuggestion: "needs_review",
          requestId,
          createdAt: now(),
          metadata: { mocked: true }
        };
        this.recordUsage(userId, request.path, status, request.body);
        return { status, body: response };
      }
      return { status, body: { error: "not_found", requestId } };
    } catch (error) {
      status = error instanceof CloudHttpError ? error.status : 500;
      return { status, body: { error: error instanceof Error ? error.message : String(error), requestId } };
    } finally {
      this.requestLogs.push({
        requestId,
        route,
        ...(userId ? { userId } : {}),
        status,
        timestamp: now()
      });
    }
  }

  private requireAuth(request: CloudRequest): { userId: string } {
    const token = bearerToken(request.headers);
    if (!token || !this.devTokens.has(token)) {
      throw new CloudHttpError(401, "unauthorized");
    }
    return { userId: DEV_USER.id };
  }

  private ensurePlannerPayloadAllowed(body: unknown): void {
    const bytes = Buffer.byteLength(JSON.stringify(body ?? {}), "utf8");
    if (bytes > this.config.maxPlannerPayloadBytes) {
      throw new CloudHttpError(413, "planner payload is too large");
    }
  }

  private recordUsage(userId: string, route: string, status: number, body: unknown): void {
    this.usage.push({
      id: `usage_${randomUUID()}`,
      userId,
      route,
      provider: "mock",
      model: this.config.openAiApiKeyConfigured ? "configured" : "mock",
      payloadBytes: Buffer.byteLength(JSON.stringify(body ?? {}), "utf8"),
      status,
      createdAt: now()
    });
  }
}

export function createCloudApp(config: Partial<CloudConfig> = {}): AgentBridgeCloudApp {
  return new AgentBridgeCloudApp({ ...loadConfig(), ...config });
}

export async function startServer(app = createCloudApp()): Promise<void> {
  const server = createServer((request, response) => {
    void handleNodeRequest(app, request, response);
  });
  const port = loadConfig().port;
  server.listen(port, () => {
    console.log(`AgentBridge Cloud listening on ${port}`);
  });
}

async function handleNodeRequest(app: AgentBridgeCloudApp, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request);
  const result = await app.handle({
    method: request.method ?? "GET",
    path: request.url?.split("?")[0] ?? "/",
    headers: normalizeHeaders(request.headers),
    body
  });
  response.writeHead(result.status, { "content-type": "application/json" });
  response.end(JSON.stringify(result.body));
}

function loadConfig(): CloudConfig {
  return {
    port: Number(process.env.AGENTBRIDGE_CLOUD_PORT ?? 8787),
    openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    logRawPayloads: process.env.LOG_RAW_PAYLOADS === "true",
    maxPlannerPayloadBytes: Number(process.env.MAX_PLANNER_PAYLOAD_BYTES ?? 64 * 1024)
  };
}

function mockTaskSpec(): HostedPlannerTaskSpecResponse["taskSpec"] {
  return {
    title: "Mock hosted planner TaskSpec",
    goal: "Demonstrate the hosted planner contract.",
    background: "Cloud planner routes are mocked in Wave 24.",
    instructions: ["Keep the task scoped.", "Verify with configured commands when a workspace exists."],
    requirements: ["No repo files are required by default."],
    constraints: ["Do not upload repo content."],
    nonGoals: ["Do not implement additional providers."],
    acceptanceCriteria: ["A valid TaskSpec is returned."],
    suggestedFiles: [],
    verificationSteps: [],
    expectedSummaryFormat: "Summary, changed files, verification."
  };
}

function bearerToken(headers: CloudRequest["headers"]): string | undefined {
  const value = headers?.authorization ?? headers?.Authorization;
  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }
  return value.slice("Bearer ".length);
}

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function now(): string {
  return new Date().toISOString();
}

class CloudHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

if (process.argv[1]?.endsWith("apps/cloud/dist/index.js")) {
  void startServer();
}
