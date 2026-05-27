import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CodexAppServerClient,
  CodexAppServerError,
  JsonRpcStdioTransport,
  type CodexAppServerTransport
} from "../src/services/codex-app-server-client.js";

describe("CodexAppServerClient", () => {
  it("lists threads from app-server responses", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const client = new CodexAppServerClient({
      transport: {
        async request(method, params) {
          calls.push({ method, params });
          return {
            threads: [{ threadId: "thread_1", title: "Refactor flow", cwd: "C:/repo", status: "idle" }]
          };
        }
      }
    });

    await expect(client.listThreads({ cwd: "C:/repo" })).resolves.toEqual([
      expect.objectContaining({ threadId: "thread_1", name: "Refactor flow", cwd: "C:/repo", status: "idle" })
    ]);
    expect(calls[0]).toEqual({ method: "thread/list", params: { cwd: "C:/repo" } });
  });

  it("resumes threads and starts turns with text input", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        return method === "turn/start" ? { turn: { id: "turn_1" } } : {};
      }
    };
    const client = new CodexAppServerClient({ transport });

    await client.resumeThread("thread_1", { cwd: "C:/repo" });
    await expect(client.startTurn("thread_1", "Fix the tests", { cwd: "C:/repo" })).resolves.toMatchObject({
      threadId: "thread_1",
      turnId: "turn_1"
    });

    expect(calls).toEqual([
      { method: "thread/resume", params: { threadId: "thread_1", cwd: "C:/repo" } },
      { method: "turn/start", params: { threadId: "thread_1", input: [{ type: "text", text: "Fix the tests" }], cwd: "C:/repo" } }
    ]);
  });

  it("starts a new thread and can name it", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const client = new CodexAppServerClient({
      transport: {
        async request(method, params) {
          calls.push({ method, params });
          return method === "thread/start" ? { thread: { id: "thread_new", sessionId: "thread_new", cwd: "C:/repo" } } : {};
        }
      }
    });

    await expect(client.startThread({ cwd: "C:/repo", title: "Evidence regression" })).resolves.toMatchObject({
      threadId: "thread_new",
      name: "Evidence regression",
      cwd: "C:/repo"
    });
    expect(calls).toEqual([
      { method: "thread/start", params: { serviceName: "agentbridge", cwd: "C:/repo" } },
      { method: "thread/name/set", params: { threadId: "thread_new", name: "Evidence regression" } },
      { method: "thread/goal/set", params: { threadId: "thread_new", objective: "Evidence regression", status: "active" } }
    ]);
  });

  it("steers turns and normalizes thread events", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const client = new CodexAppServerClient({
      transport: {
        async request(method, params) {
          calls.push({ method, params });
          if (method === "turn/steer") {
            return { turnId: "turn_1", accepted: true };
          }
          return { events: [{ type: "agent.message.completed", turnId: "turn_1", text: "Done" }] };
        }
      }
    });

    await expect(client.steerTurn("thread_1", "Keep going", { turnId: "turn_1" })).resolves.toMatchObject({
      threadId: "thread_1",
      turnId: "turn_1"
    });
    await expect(client.listThreadEvents("thread_1", "turn_1")).resolves.toEqual([
      { type: "agent.message.completed", payload: { type: "agent.message.completed", turnId: "turn_1", text: "Done" } }
    ]);

    expect(calls).toEqual([
      { method: "turn/steer", params: { threadId: "thread_1", input: [{ type: "text", text: "Keep going" }], expectedTurnId: "turn_1" } },
      { method: "thread/read", params: { threadId: "thread_1", includeTurns: true } }
    ]);
  });

  it("returns a clean unavailable error without transport", async () => {
    const client = new CodexAppServerClient();

    await expect(client.listThreads()).rejects.toMatchObject({
      code: "appServerUnavailable"
    } satisfies Partial<CodexAppServerError>);
  });

  it("talks to a stdio JSON-RPC Codex app-server and initializes first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentbridge-codex-stdio-"));
    const script = join(dir, "mock-codex-server.cjs");
    await writeFile(script, `
      const readline = require("node:readline");
      const rl = readline.createInterface({ input: process.stdin });
      rl.on("line", (line) => {
        const msg = JSON.parse(line);
        if (msg.method === "initialize") {
          process.stdout.write(JSON.stringify({ id: msg.id, result: { ok: true } }) + "\\n");
          return;
        }
        if (msg.method === "initialized") {
          return;
        }
        process.stdout.write(JSON.stringify({ id: msg.id, result: { data: [{ id: "thread_stdio", title: "Stdio thread", cwd: "C:/repo" }] } }) + "\\n");
      });
    `);
    try {
      const client = new CodexAppServerClient({
        transport: new JsonRpcStdioTransport(process.execPath, [script])
      });

      await expect(client.listLoadedThreads()).resolves.toEqual([
        expect.objectContaining({ threadId: "thread_stdio", name: "Stdio thread", cwd: "C:/repo" })
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
