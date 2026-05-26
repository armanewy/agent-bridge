import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodexDeepLinkTarget, type AgentSessionRef, type TaskSpec } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { CodexAppServerClient, type CodexAppServerTransport } from "../src/services/codex-app-server-client.js";
import { CodexSessionService } from "../src/services/codex-session-service.js";
import { CodexTargetService } from "../src/services/codex-target-service.js";
import { CODEX_EXECUTOR_PROVIDER_ID, CodexExecutorProvider } from "../src/services/providers/codex-executor-provider.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-executor-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CodexExecutorProvider", () => {
  it("reports available when a deep-link target exists", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveTarget(createCodexDeepLinkTarget({ id: "target_1", repoPath: tempDir }));
    const provider = createProvider(store);

    const status = await provider.status();

    expect(status.status).toBe("available");
    expect(status.metadata.deepLinkTargetCount).toBe(1);
  });

  it("sends a new-thread dry run through Codex deep link routing", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = createProvider(store);

    const result = await provider.sendTask({
      missionId: "mission_1",
      taskSpec: sampleTaskSpec(),
      repoContext: { repoPath: tempDir },
      dryRun: true,
      metadata: {}
    });

    expect(result.providerId).toBe(CODEX_EXECUTOR_PROVIDER_ID);
    expect(result.deliveryMode).toBe("dryRun");
    expect(result.success).toBe(true);
    expect(result.artifactIds).toHaveLength(1);
    await expect(store.listAgentTurns(result.sessionRef?.id ?? "")).resolves.toHaveLength(1);
    await expect(store.listDeliveryAttempts()).resolves.toEqual([
      expect.objectContaining({
        success: true,
        targetMetadata: expect.objectContaining({ deliveryMode: "newDeepLink" })
      })
    ]);
  });

  it("continues an existing thread through Codex App Server", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        return method === "turn/start" ? { turnId: "turn_123" } : {};
      }
    };
    const appServerClient = new CodexAppServerClient({ transport });
    const store = new JsonFileStore(tempDir);
    const session = existingCodexSession("appServer");
    await store.saveAgentSession(session);
    const provider = createProvider(store, { appServerClient });

    const result = await provider.sendTask({
      missionId: "mission_2",
      sessionRefId: session.id,
      taskSpec: sampleTaskSpec(),
      repoContext: { repoPath: tempDir },
      dryRun: false,
      metadata: {}
    });

    expect(calls).toEqual([
      { method: "thread/resume", params: { threadId: "thread_123", cwd: tempDir } },
      { method: "turn/start", params: { threadId: "thread_123", input: { type: "text", text: expect.stringContaining("Goal:") }, cwd: tempDir } }
    ]);
    expect(result.deliveryMode).toBe("existingSession");
    expect(result.metadata.codexTurnId).toBe("turn_123");
  });

  it("opens an existing thread without claiming prompt injection when app-server is unavailable", async () => {
    const opened: string[] = [];
    const store = new JsonFileStore(tempDir);
    const session = existingCodexSession("deepLink");
    await store.saveAgentSession(session);
    const provider = createProvider(store, { openExternal: async (url) => { opened.push(url); } });

    const result = await provider.sendTask({
      missionId: "mission_3",
      sessionRefId: session.id,
      taskSpec: sampleTaskSpec(),
      repoContext: { repoPath: tempDir },
      dryRun: false,
      metadata: {}
    });

    expect(opened).toEqual(["codex://threads/thread_123"]);
    expect(result.deliveryMode).toBe("openOnlyFallback");
    expect(result.warnings).toEqual([expect.stringContaining("Prompt was staged")]);
  });
});

function createProvider(
  store: JsonFileStore,
  options: { appServerClient?: CodexAppServerClient; openExternal?: (url: string) => Promise<void> } = {}
): CodexExecutorProvider {
  const appServerClient = options.appServerClient ?? new CodexAppServerClient();
  const sessionService = new CodexSessionService(store, appServerClient);
  const targetService = new CodexTargetService(store, options.openExternal, appServerClient);
  return new CodexExecutorProvider(store, sessionService, targetService, appServerClient, fixedNow);
}

function existingCodexSession(integrationMode: "deepLink" | "appServer"): AgentSessionRef {
  return {
    id: `codex_session_${integrationMode}`,
    providerId: CODEX_EXECUTOR_PROVIDER_ID,
    providerKind: "executor",
    externalSessionId: "thread_123",
    title: "Existing Codex task",
    repoPath: tempDir,
    status: "idle",
    lastSeenAt: fixedNow(),
    metadata: {
      openMode: "existingThread",
      integrationMode,
      codexThreadId: "thread_123"
    }
  };
}

function sampleTaskSpec(): TaskSpec {
  return {
    title: "Implement provider workbench",
    goal: "Send the generated task to Codex.",
    background: "AgentBridge is moving to provider adapters.",
    instructions: ["Use the existing Codex target service."],
    requirements: ["Delivery mode must be explicit."],
    constraints: ["Do not add new providers."],
    nonGoals: ["Do not use generic desktop automation."],
    acceptanceCriteria: ["A Codex delivery attempt is recorded."],
    suggestedFiles: ["apps/desktop/src/services/providers/codex-executor-provider.ts"],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary and verification"
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
