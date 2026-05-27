import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentSessionRef, TaskSpec } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { CodexAppServerClient, type CodexAppServerTransport } from "../src/services/codex-app-server-client.js";
import { CodexSessionService } from "../src/services/codex-session-service.js";
import { CODEX_EXECUTOR_PROVIDER_ID, CodexExecutorProvider } from "../src/services/providers/codex-executor-provider.js";
import { ArtifactBrokerService } from "../src/services/artifact-broker-service.js";
import { PlatformService } from "../src/services/platform-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-executor-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe("CodexExecutorProvider", () => {
  it("reports unavailable when Codex App Server is unavailable", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = createProvider(store);

    const status = await provider.status();

    expect(status.status).toBe("unavailable");
    expect(status.metadata.appServerAvailable).toBe(false);
  });

  it("records a dry run through Codex App Server session routing", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = createProvider(store, { appServerClient: appServerClientForNewThread() });

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
        targetMetadata: expect.objectContaining({ deliveryMode: "dryRun" })
      })
    ]);
  });

  it("continues an existing thread through Codex App Server", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        return method === "turn/start" ? { turn: { id: "turn_123" } } : {};
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
      { method: "turn/start", params: { threadId: "thread_123", input: [{ type: "text", text: expect.stringContaining("Goal:") }], cwd: tempDir } }
    ]);
    expect(result.deliveryMode).toBe("existingSession");
    expect(result.metadata.codexTurnId).toBe("turn_123");
    await expect(store.listAgentEvents({ providerId: CODEX_EXECUTOR_PROVIDER_ID })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "turn.completed" }),
        expect.objectContaining({ type: "turn.started" })
      ])
    );
  });

  it("creates a new Codex App Server thread before sending the first task", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        if (method === "thread/start") {
          return { thread: { id: "thread_new", sessionId: "thread_new", cwd: tempDir } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn_new" } };
        }
        return {};
      }
    };
    const appServerClient = new CodexAppServerClient({ transport });
    const store = new JsonFileStore(tempDir);
    const provider = createProvider(store, { appServerClient });

    const result = await provider.sendTask({
      missionId: "mission_new",
      taskSpec: sampleTaskSpec(),
      repoContext: { repoPath: tempDir },
      dryRun: false,
      metadata: {}
    });

    expect(calls).toEqual([
      { method: "thread/start", params: { serviceName: "agentbridge", cwd: tempDir } },
      { method: "thread/name/set", params: { threadId: "thread_new", name: sampleTaskSpec().title } },
      { method: "thread/goal/set", params: { threadId: "thread_new", objective: sampleTaskSpec().title, status: "active" } },
      { method: "thread/resume", params: { threadId: "thread_new", cwd: tempDir } },
      { method: "turn/start", params: { threadId: "thread_new", input: [{ type: "text", text: expect.stringContaining("Goal:") }], cwd: tempDir } }
    ]);
    expect(result.deliveryMode).toBe("existingSession");
    expect(result.metadata.codexThreadId).toBe("thread_new");
    expect(result.metadata.codexTurnId).toBe("turn_new");
  });


  it("monitors an app-server Codex thread and stores provider events", async () => {
    const transport: CodexAppServerTransport = {
      async request(method) {
        if (method === "thread/read") {
          return {
            events: [
              { type: "turn.started", turnId: "turn_123" },
              { type: "tool.progress", turnId: "turn_123", message: "editing" },
              { type: "turn.completed", turnId: "turn_123" }
            ]
          };
        }
        return {};
      }
    };
    const appServerClient = new CodexAppServerClient({ transport });
    const store = new JsonFileStore(tempDir);
    const session = existingCodexSession("appServer");
    await store.saveAgentSession({ ...session, metadata: { ...session.metadata, codexTurnId: "turn_123" } });
    const provider = createProvider(store, { appServerClient });

    const result = await provider.monitorTurn(session, { missionId: "mission_2" });

    expect(result.status).toBe("completed");
    expect(result.eventCount).toBe(3);
    await expect(store.listAgentEvents({ providerId: CODEX_EXECUTOR_PROVIDER_ID })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "turn.started" }),
        expect.objectContaining({ type: "tool.progress" }),
        expect.objectContaining({ type: "turn.completed" })
      ])
    );
  });

  it("steers an existing app-server Codex turn", async () => {
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        return { turnId: "turn_123", accepted: true };
      }
    };
    const appServerClient = new CodexAppServerClient({ transport });
    const store = new JsonFileStore(tempDir);
    const session = existingCodexSession("appServer");
    await store.saveAgentSession({ ...session, metadata: { ...session.metadata, codexTurnId: "turn_123" } });
    const provider = createProvider(store, { appServerClient });

    const turn = await provider.steerTurn(session, "Use the smaller fix.", { missionId: "mission_2" });

    expect(turn.metadata.source).toBe("autopilotSteering");
    expect(calls).toEqual([
      { method: "turn/steer", params: { threadId: "thread_123", input: [{ type: "text", text: "Use the smaller fix." }], expectedTurnId: "turn_123" } }
    ]);
    await expect(store.listAgentEvents({ type: "turn.steer" })).resolves.toHaveLength(1);
  });

  it("stages artifact files and includes a manifest in the Codex prompt", async () => {
    const store = new JsonFileStore(tempDir);
    const broker = new ArtifactBrokerService(store, new PlatformService({ platform: "win32", userDataDir: tempDir }), fixedNow);
    const file = await broker.importGeneratedTextAsFile("mission_4", "notes.md", "Executor context", {
      classification: "document"
    });
    const provider = createProvider(store, { appServerClient: appServerClientForNewThread(), artifactBroker: broker });

    const result = await provider.sendTask({
      missionId: "mission_4",
      taskSpec: sampleTaskSpec(),
      repoContext: { repoPath: tempDir },
      fileIds: [file.id],
      dryRun: true,
      metadata: {}
    });

    const turns = await store.listAgentTurns(result.sessionRef?.id ?? "");
    expect(turns[0]?.content).toContain("AgentBridge staged artifacts:");
    expect(turns[0]?.content).toContain("notes.md");
    expect(result.metadata.stagedFilePaths).toEqual([expect.stringContaining(file.id)]);
  });
});

function createProvider(
  store: JsonFileStore,
  options: {
    appServerClient?: CodexAppServerClient;
    artifactBroker?: ArtifactBrokerService;
  } = {}
): CodexExecutorProvider {
  const appServerClient = options.appServerClient;
  const sessionService = new CodexSessionService(store, appServerClient);
  return new CodexExecutorProvider(store, sessionService, appServerClient, fixedNow, {}, options.artifactBroker);
}

function appServerClientForNewThread(threadId = "thread_new"): CodexAppServerClient {
  return new CodexAppServerClient({
    transport: {
      async request(method) {
        if (method === "thread/start") {
          return { thread: { id: threadId, cwd: tempDir } };
        }
        return {};
      }
    }
  });
}

function existingCodexSession(integrationMode: "appServer"): AgentSessionRef {
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
