import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
  notify?(method: string, params?: unknown): Promise<void>;
}

export interface CodexAppServerThread {
  threadId: string;
  name?: string;
  cwd?: string;
  status?: CodexThreadRef["status"];
  metadata: Record<string, unknown>;
}

export interface CodexThreadStartResult {
  threadId: string;
  sessionId?: string;
  name?: string;
  cwd?: string;
  metadata: Record<string, unknown>;
}

export interface CodexTurnStartResult {
  threadId: string;
  turnId?: string;
  metadata: Record<string, unknown>;
}

export interface CodexTurnSteerResult {
  threadId: string;
  turnId?: string;
  metadata: Record<string, unknown>;
}

export interface CodexAppServerEvent {
  type: string;
  payload: Record<string, unknown>;
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
    await this.request("initialize", defaultInitializeParams());
  }

  async startThread(options: { cwd?: string; title?: string; goal?: string; model?: string } = {}): Promise<CodexThreadStartResult> {
    const result = await this.request("thread/start", {
      serviceName: "agentbridge",
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.model ? { model: options.model } : {})
    });
    const record = isRecord(result) ? result : {};
    const thread = isRecord(record["thread"]) ? record["thread"] : record;
    const threadId = stringValue(thread["id"]) ?? stringValue(thread["threadId"]) ?? stringValue(thread["sessionId"]);
    if (!threadId) {
      throw new CodexAppServerError("turnStartFailed", "Codex App Server did not return a thread id.");
    }

    if (options.title?.trim()) {
      await this.setThreadName(threadId, options.title.trim()).catch(() => undefined);
    }
    const goal = options.goal?.trim() ?? options.title?.trim();
    if (goal) {
      await this.setThreadGoal(threadId, goal).catch(() => undefined);
    }
    const sessionId = stringValue(thread["sessionId"]);
    const name = options.title?.trim() ?? stringValue(thread["name"]);
    const cwd = options.cwd ?? stringValue(thread["cwd"]);

    return {
      threadId,
      ...(sessionId ? { sessionId } : {}),
      ...(name ? { name } : {}),
      ...(cwd ? { cwd } : {}),
      metadata: record
    };
  }

  async setThreadName(threadId: string, name: string): Promise<void> {
    await this.request("thread/name/set", { threadId, name });
  }

  async setThreadGoal(threadId: string, objective: string): Promise<void> {
    await this.request("thread/goal/set", { threadId, objective: objective.slice(0, 4000), status: "active" });
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
        input: [{ type: "text", text }],
        ...(options.cwd ? { cwd: options.cwd } : {})
      });
      const record = isRecord(result) ? result : {};
      const turn = isRecord(record["turn"]) ? record["turn"] : record;
      const turnId = stringValue(turn["id"]) ?? stringValue(record["turnId"]) ?? stringValue(record["id"]);
      return {
        threadId,
        ...(turnId ? { turnId } : {}),
        metadata: record
      };
    } catch (error) {
      throw normalizeAppServerError(error, "turnStartFailed", `Failed to start a turn in Codex thread ${threadId}.`);
    }
  }

  async steerTurn(threadId: string, text: string, options: { turnId?: string } = {}): Promise<CodexTurnSteerResult> {
    if (!text.trim()) {
      throw new CodexAppServerError("turnStartFailed", "Cannot steer a Codex turn with an empty message.");
    }

    try {
      const result = await this.request("turn/steer", {
        threadId,
        input: [{ type: "text", text }],
        ...(options.turnId ? { expectedTurnId: options.turnId } : {})
      });
      const record = isRecord(result) ? result : {};
      const turnId = stringValue(record["turnId"]) ?? stringValue(record["id"]) ?? options.turnId;
      return {
        threadId,
        ...(turnId ? { turnId } : {}),
        metadata: record
      };
    } catch (error) {
      throw normalizeAppServerError(error, "turnStartFailed", `Failed to steer Codex thread ${threadId}.`);
    }
  }

  async listThreadEvents(threadId: string, turnId?: string): Promise<CodexAppServerEvent[]> {
    const result = await this.readThread(threadId, true);
    return normalizeEvents(result, turnId);
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

function normalizeEvents(value: unknown, turnId?: string): CodexAppServerEvent[] {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record["events"])
    ? record["events"]
    : Array.isArray(record["items"])
      ? record["items"]
      : Array.isArray(record["turns"])
        ? record["turns"]
        : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const itemTurnId = stringValue(item["turnId"]) ?? stringValue(item["id"]);
    if (turnId && itemTurnId && itemTurnId !== turnId) {
      return [];
    }
    const type = stringValue(item["type"]) ?? stringValue(item["event"]) ?? "codex.event";
    return [{ type, payload: item }];
  });
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

export class JsonRpcStdioTransport implements CodexAppServerTransport {
  private nextId = 1;
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private initialized = false;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(
    private readonly command: string,
    private readonly args: string[] = ["app-server", "--listen", "stdio://"]
  ) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.ensureProcess();
    if (!this.initialized) {
      if (method === "initialize") {
        const result = await this.send("initialize", params ?? defaultInitializeParams());
        await this.notify("initialized", {});
        this.initialized = true;
        return result;
      }
      await this.send("initialize", defaultInitializeParams());
      await this.notify("initialized", {});
      this.initialized = true;
    }
    return this.send(method, params ?? {});
  }

  private async ensureProcess(): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }
    this.child = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(String(chunk)));
    this.child.stderr.on("data", () => {
      // Codex writes structured warnings to stderr during startup; they should not fail requests.
    });
    this.child.on("exit", (code) => {
      const error = new Error(`Codex App Server exited with code ${code ?? "unknown"}.`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.child = undefined;
      this.initialized = false;
    });
  }

  private send(method: string, params: unknown): Promise<unknown> {
    if (!this.child) {
      return Promise.reject(new Error("Codex App Server process is not running."));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child?.stdin.write(`${payload}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async notify(method: string, params: unknown = {}): Promise<void> {
    await this.ensureProcess();
    if (!this.child) {
      throw new Error("Codex App Server process is not running.");
    }
    const payload = JSON.stringify({ method, params });
    await new Promise<void>((resolve, reject) => {
      this.child?.stdin.write(`${payload}\n`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    while (this.buffer.includes("\n")) {
      const index = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) {
        continue;
      }
      let message: { id?: unknown; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        continue;
      }
      if (typeof message.id !== "number" || (!("result" in message) && !("error" in message))) {
        continue;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        continue;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? "Codex App Server JSON-RPC error."));
      } else {
        pending.resolve(message.result);
      }
    }
  }
}

function defaultInitializeParams(): Record<string, unknown> {
  return {
    clientInfo: {
      name: "agentbridge",
      title: "AgentBridge",
      version: "0.1.0"
    },
    capabilities: {
      experimentalApi: true
    }
  };
}

export function findCodexExecutable(): string | undefined {
  const candidates = [
    process.env.CODEX_APP_SERVER_COMMAND,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin", "codex.exe") : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate));
}

function normalizeThreads(value: unknown): CodexAppServerThread[] {
  const items = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value["threads"])
      ? value["threads"]
      : isRecord(value) && Array.isArray(value["sessions"])
        ? value["sessions"]
        : isRecord(value) && Array.isArray(value["data"])
          ? value["data"]
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

function normalizeAppServerError(error: unknown, code: CodexAppServerErrorCode, defaultMessage: string): CodexAppServerError {
  if (error instanceof CodexAppServerError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error || defaultMessage);
  if (message.toLowerCase().includes("not found")) {
    return new CodexAppServerError("threadNotFound", message);
  }
  return new CodexAppServerError(code, message || defaultMessage);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
