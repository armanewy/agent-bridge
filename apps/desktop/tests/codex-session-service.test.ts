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
  it("persists manual thread refs", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new CodexSessionService(store);

    const ref = await service.saveManualThreadRef("thread_123", "Auth refactor", tempDir);

    expect(await service.getCodexThreadRef("thread_123")).toEqual(ref);
    expect(await service.listSavedCodexThreadRefs(tempDir)).toEqual([ref]);
  });

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
    await expect(store.getCodexThreadRef("thread_repo")).resolves.toMatchObject({ source: "appServer" });
  });

  it("falls back to saved refs when app-server is unavailable", async () => {
    const store = new JsonFileStore(tempDir);
    await new CodexSessionService(store).saveManualThreadRef("thread_manual", undefined, tempDir);

    await expect(new CodexSessionService(store).listCodexThreads(tempDir)).resolves.toEqual([
      expect.objectContaining({ threadId: "thread_manual", source: "manual" })
    ]);
  });
});
