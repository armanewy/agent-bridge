import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { CodexAppServerClient } from "../src/services/codex-app-server-client.js";
import { CodexSessionService } from "../src/services/codex-session-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-session-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CodexSessionService", () => {
  it("turns app-server threads into stored CodexThreadRefs", async () => {
    const store = new JsonFileStore(tempDir);
    const client = new CodexAppServerClient({
      transport: {
        async request(method) {
          if (method === "thread/list") {
            return { threads: [{ threadId: "thread_repo", title: "Repo task", cwd: tempDir, status: "active" }] };
          }
          return { threads: [{ threadId: "thread_other", title: "Other task", cwd: "C:/other" }] };
        }
      }
    });

    const refs = await new CodexSessionService(store, client).listCodexThreads(tempDir);

    expect(refs[0]).toMatchObject({ threadId: "thread_repo", source: "appServer", repoPath: tempDir });
    expect(refs[0]?.name).toBe("Repo task");
    await expect(store.getCodexThreadRef("thread_repo")).resolves.toMatchObject({ source: "appServer" });
  });

  it("keeps app-server threads usable even when cwd is missing", async () => {
    const store = new JsonFileStore(tempDir);
    const client = new CodexAppServerClient({
      transport: {
        async request() {
          return { threads: [{ threadId: "thread_open", title: "Open thread", status: "idle" }] };
        }
      }
    });

    const refs = await new CodexSessionService(store, client).listCodexThreads();

    expect(refs).toEqual([
      expect.objectContaining({
        threadId: "thread_open",
        name: "Open thread",
        source: "appServer"
      })
    ]);
    expect(refs[0]?.repoPath).toBeUndefined();
  });

  it("uses saved app-server refs when app-server is unavailable", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveCodexThreadRef({
      id: "codex_thread_saved",
      threadId: "thread_saved",
      repoPath: tempDir,
      status: "idle",
      source: "appServer",
      lastSeenAt: new Date().toISOString(),
      metadata: {}
    });

    await expect(new CodexSessionService(store).listCodexThreads(tempDir)).resolves.toEqual([
      expect.objectContaining({ threadId: "thread_saved", source: "appServer" })
    ]);
  });
});
