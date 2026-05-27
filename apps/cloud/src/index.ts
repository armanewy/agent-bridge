import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export interface CloudConfig {
  port: number;
  maxRequestBytes: number;
  allowDevLogin: boolean;
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

  getUsageRecords(): Array<Record<string, unknown>> {
    return [...this.usage];
  }

  getConfig(): CloudConfig {
    return { ...this.config };
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
        if (!this.config.allowDevLogin) {
          throw new CloudHttpError(404, "development login is disabled");
        }
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
}

export function createCloudApp(config: Partial<CloudConfig> = {}): AgentBridgeCloudApp {
  return new AgentBridgeCloudApp({ ...loadConfig(), ...config });
}

export async function startServer(app = createCloudApp()): Promise<void> {
  const server = createServer((request, response) => {
    void handleNodeRequest(app, request, response);
  });
  const port = app.getConfig().port;
  server.listen(port, () => {
    console.log(`AgentBridge Cloud listening on ${port}`);
  });
}

async function handleNodeRequest(app: AgentBridgeCloudApp, request: IncomingMessage, response: ServerResponse): Promise<void> {
  let result: CloudResponse;
  try {
    const body = await readJsonBody(request, app.getConfig().maxRequestBytes);
    result = await app.handle({
      method: request.method ?? "GET",
      path: request.url?.split("?")[0] ?? "/",
      headers: normalizeHeaders(request.headers),
      body
    });
  } catch (error) {
    result = {
      status: error instanceof CloudHttpError ? error.status : 400,
      body: { error: error instanceof Error ? error.message : String(error) }
    };
  }
  response.writeHead(result.status, { "content-type": "application/json" });
  response.end(JSON.stringify(result.body));
}

function loadConfig(): CloudConfig {
  return {
    port: Number(process.env.AGENTBRIDGE_CLOUD_PORT ?? 8787),
    maxRequestBytes: Number(process.env.AGENTBRIDGE_CLOUD_MAX_REQUEST_BYTES ?? 64 * 1024),
    allowDevLogin: process.env.AGENTBRIDGE_CLOUD_ALLOW_DEV_LOGIN === "true" || process.env.AGENTBRIDGE_CLOUD_ALLOW_DEV_LOGIN === "1"
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

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CloudHttpError(413, "request body is too large");
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new CloudHttpError(413, "request body is too large");
    }
    chunks.push(buffer);
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startServer();
}
