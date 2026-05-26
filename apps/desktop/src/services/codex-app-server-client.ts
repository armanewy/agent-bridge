import type { CodexThreadRef } from "@agentbridge/core";

export type CodexAppServerErrorCode = "appServerUnavailable" | "threadNotFound" | "resumeFailed" | "turnStartFailed";

export class CodexAppServerError extends Error {
  constructor(
    readonly code: CodexAppServerErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CodexAppServerError";
  }
}

export interface CodexAppServerTransport {
  request(method: string, params?: unknown): Promise<unknown>;
}

export interface CodexAppServerThread {
  threadId: string;
  name?: string;
  cwd?: string;
  status?: CodexThreadRef["status"];
  metadata: Record<string, unknown>;
}

export interface CodexTurnStartResult {
  threadId: string;
  turnId?: string;
  metadata: Record<string, unknown>;
}

export interface CodexAppServerClientOptions {
  transport?: CodexAppServerTransport;
  endpoint?: string;
}

export class CodexAppServerClient {
  private readonly transport: CodexAppServerTransport | undefined;

  constructor(options: CodexAppServerClientOptions = {}) {
    this.transport = options.transport ?? (options.endpoint ? new JsonRpcHttpTransport(options.endpoint) : undefined);
  }

  async healthCheck(): Promise<{ available: boolean; message?: string }> {
    if (!this.transport) {
      return { available: false, message: "Codex App Server transport is not configured." };
    }

    try {
      await this.transport.request("thread/loaded/list", {});
      return { available: true };
    } catch (error) {
      return { available: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {});
  }

  async listThreads(filter: { cwd?: string; searchTerm?: string } = {}): Promise<CodexAppServerThread[]> {
    const result = await this.request("thread/list", filter);
    return normalizeThreads(result);
  }

  async readThread(threadId: string, includeTurns = false): Promise<unknown> {
    return this.request("thread/read", { threadId, includeTurns });
  }

  async resumeThread(threadId: string, options: { cwd?: string } = {}): Promise<unknown> {
    try {
      return await this.request("thread/resume", { threadId, ...options });
    } catch (error) {
      throw normalizeAppServerError(error, "resumeFailed", `Failed to resume Codex thread ${threadId}.`);
    }
  }

  async startTurn(threadId: string, text: string, options: { cwd?: string } = {}): Promise<CodexTurnStartResult> {
    if (!text.trim()) {
      throw new CodexAppServerError("turnStartFailed", "Cannot start a Codex turn with an empty prompt.");
    }

    try {
      const result = await this.request("turn/start", {
        threadId,
        input: { type: "text", text },
        ...(options.cwd ? { cwd: options.cwd } : {})
      });
      const record = isRecord(result) ? result : {};
      const turnId = stringValue(record["turnId"]) ?? stringValue(record["id"]);
      return {
        threadId,
        ...(turnId ? { turnId } : {}),
        metadata: record
      };
    } catch (error) {
      throw normalizeAppServerError(error, "turnStartFailed", `Failed to start a turn in Codex thread ${threadId}.`);
    }
  }

  async listLoadedThreads(): Promise<CodexAppServerThread[]> {
    const result = await this.request("thread/loaded/list", {});
    return normalizeThreads(result);
  }

  private async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.transport) {
      throw new CodexAppServerError("appServerUnavailable", "Codex App Server transport is not configured.");
    }

    try {
      return (await this.transport.request(method, params)) as T;
    } catch (error) {
      throw normalizeAppServerError(error, "appServerUnavailable", "Codex App Server is unavailable.");
    }
  }
}

export class JsonRpcHttpTransport implements CodexAppServerTransport {
  private nextId = 1;

  constructor(private readonly endpoint: string) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId++,
        method,
        params: params ?? {}
      })
    });
    if (!response.ok) {
      throw new Error(`Codex App Server returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (payload.error) {
      throw new Error(payload.error.message ?? "Codex App Server JSON-RPC error.");
    }
    return payload.result;
  }
}

function normalizeThreads(value: unknown): CodexAppServerThread[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value["threads"])
      ? value["threads"]
      : isRecord(value) && Array.isArray(value["sessions"])
        ? value["sessions"]
        : [];

  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const threadId = stringValue(item["threadId"]) ?? stringValue(item["id"]);
    if (!threadId) {
      return [];
    }
    const name = stringValue(item["name"]) ?? stringValue(item["title"]) ?? stringValue(item["summary"]);
    const cwd = stringValue(item["cwd"]) ?? stringValue(item["repoPath"]);
    const status = normalizeStatus(stringValue(item["status"]));
    return [
      {
        threadId,
        ...(name ? { name } : {}),
        ...(cwd ? { cwd } : {}),
        ...(status ? { status } : {}),
        metadata: item
      }
    ];
  });
}

function normalizeStatus(value?: string): CodexThreadRef["status"] | undefined {
  if (value === "notLoaded" || value === "idle" || value === "active" || value === "systemError" || value === "archived") {
    return value;
  }
  return value ? "unknown" : undefined;
}

function normalizeAppServerError(error: unknown, code: CodexAppServerErrorCode, fallback: string): CodexAppServerError {
  if (error instanceof CodexAppServerError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error || fallback);
  if (message.toLowerCase().includes("not found")) {
    return new CodexAppServerError("threadNotFound", message);
  }
  return new CodexAppServerError(code, message || fallback);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
