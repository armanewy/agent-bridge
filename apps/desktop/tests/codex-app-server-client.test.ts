import { describe, expect, it } from "vitest";
import { CodexAppServerClient, CodexAppServerError, type CodexAppServerTransport } from "../src/services/codex-app-server-client.js";

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
        return method === "turn/start" ? { turnId: "turn_1" } : {};
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
      { method: "turn/start", params: { threadId: "thread_1", input: { type: "text", text: "Fix the tests" }, cwd: "C:/repo" } }
    ]);
  });

  it("returns a clean unavailable error without transport", async () => {
    const client = new CodexAppServerClient();

    await expect(client.listThreads()).rejects.toMatchObject({
      code: "appServerUnavailable"
    } satisfies Partial<CodexAppServerError>);
  });
});
