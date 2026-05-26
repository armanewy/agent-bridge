import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { CodexDeepLinkTarget, HandoffCard, Mission } from "@agentbridge/core";
import { CodexAppServerClient, type CodexAppServerTransport } from "../src/services/codex-app-server-client.js";
import { CodexTargetService } from "../src/services/codex-target-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CodexTargetService", () => {
  it("creates valid Codex targets", async () => {
    const service = new CodexTargetService(new JsonFileStore(tempDir));
    const target = await service.configureTarget(tempDir);

    expect(target.kind).toBe("codexDeepLink");
    expect(target.repoPath).toBe(tempDir);
  });

  it("supports dry-run delivery without opening Codex", async () => {
    const setupStore = new JsonFileStore(tempDir);
    const service = new CodexTargetService(setupStore);
    const target = await service.configureTarget(tempDir);
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard());
    const result = await new CodexTargetService(store).deliver({
      target,
      prompt: "Fix it",
      dryRun: true,
      missionId: "mission_1",
      handoffCardId: "card_1",
      handoffId: "handoff_1"
    });

    expect(result.deepLink).toContain("codex://threads/new?");
    expect(result.promptLength).toBe(6);
    await expect(store.listDeliveryAttempts("handoff_1")).resolves.toEqual([
      expect.objectContaining({ missionId: "mission_1", handoffCardId: "card_1" })
    ]);
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "draft" });
    await expect(store.getHandoffCard("card_1")).resolves.toMatchObject({ deliveryAttemptIds: [expect.any(String)] });
  });

  it("marks the mission delivered on successful send", async () => {
    const target = await new CodexTargetService(new JsonFileStore(tempDir)).configureTarget(tempDir);
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard());

    await new CodexTargetService(store, async () => undefined).deliver({
      target,
      prompt: "Fix it",
      dryRun: false,
      missionId: "mission_1",
      handoffCardId: "card_1",
      handoffId: "handoff_1"
    });

    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "delivered" });
    await expect(store.listDeliveryAttempts("handoff_1")).resolves.toEqual([
      expect.objectContaining({ missionId: "mission_1", handoffCardId: "card_1", success: true })
    ]);
  });

  it("records failed attempts with mission and card refs", async () => {
    const target = await new CodexTargetService(new JsonFileStore(tempDir)).configureTarget(tempDir);
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard());

    await expect(
      new CodexTargetService(store).deliver({
        target,
        prompt: "Fix it",
        dryRun: false,
        missionId: "mission_1",
        handoffCardId: "card_1",
        handoffId: "handoff_1"
      })
    ).rejects.toThrow("No opener configured");

    await expect(store.listDeliveryAttempts("handoff_1")).resolves.toEqual([
      expect.objectContaining({ missionId: "mission_1", handoffCardId: "card_1", success: false })
    ]);
  });

  it("opens an existing thread deep link without marking the mission delivered", async () => {
    const target = createExistingThreadTarget("deepLink");
    const opened: string[] = [];
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard());

    const result = await new CodexTargetService(store, async (url) => {
      opened.push(url);
    }).deliver({
      target,
      prompt: "Continue this task",
      dryRun: false,
      missionId: "mission_1",
      handoffCardId: "card_1",
      handoffId: "handoff_existing",
      codexThreadId: "thread_123",
      codexOpenMode: "existingThread",
      codexIntegrationMode: "deepLink"
    });

    expect(opened).toEqual(["codex://threads/thread_123"]);
    expect(result).toMatchObject({
      deliveryMode: "existingDeepLinkOpen",
      codexThreadId: "thread_123",
      warnings: [expect.stringContaining("Prompt was staged")]
    });
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "draft" });
    await expect(store.listDeliveryAttempts("handoff_existing")).resolves.toEqual([
      expect.objectContaining({
        success: true,
        warnings: [expect.stringContaining("Prompt was staged")],
        targetMetadata: expect.objectContaining({ deliveryMode: "existingDeepLinkOpen", codexThreadId: "thread_123" })
      })
    ]);
  });

  it("resumes an existing thread and starts a turn through app-server", async () => {
    const target = createExistingThreadTarget("appServer");
    const calls: Array<{ method: string; params?: unknown }> = [];
    const transport: CodexAppServerTransport = {
      async request(method, params) {
        calls.push({ method, params });
        return method === "turn/start" ? { turnId: "turn_123" } : {};
      }
    };
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard());

    const result = await new CodexTargetService(store, undefined, new CodexAppServerClient({ transport })).deliver({
      target,
      prompt: "Continue this task",
      dryRun: false,
      missionId: "mission_1",
      handoffCardId: "card_1",
      handoffId: "handoff_app_server",
      codexThreadId: "thread_123",
      codexOpenMode: "existingThread",
      codexIntegrationMode: "appServer"
    });

    expect(calls).toEqual([
      { method: "thread/resume", params: { threadId: "thread_123", cwd: tempDir } },
      { method: "turn/start", params: { threadId: "thread_123", input: { type: "text", text: "Continue this task" }, cwd: tempDir } }
    ]);
    expect(result).toMatchObject({
      deliveryMode: "appServerTurnStart",
      codexThreadId: "thread_123",
      codexTurnId: "turn_123"
    });
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "delivered" });
    await expect(store.listDeliveryAttempts("handoff_app_server")).resolves.toEqual([
      expect.objectContaining({
        success: true,
        targetMetadata: expect.objectContaining({ deliveryMode: "appServerTurnStart", codexThreadId: "thread_123", codexTurnId: "turn_123" })
      })
    ]);
  });
});

function createMission(): Mission {
  return {
    id: "mission_1",
    title: "Mission",
    goal: "Deliver prompt",
    status: "draft",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: ["card_1"],
    artifactIds: [],
    runIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createCard(): HandoffCard {
  return {
    id: "card_1",
    missionId: "mission_1",
    sourceId: "source_1",
    captureId: "capture_1",
    targetId: "target_1",
    recipe: "implementationBrief",
    taskSpec: {
      title: "Task",
      goal: "Deliver prompt",
      background: "Background",
      instructions: [],
      requirements: [],
      constraints: [],
      nonGoals: [],
      acceptanceCriteria: [],
      suggestedFiles: [],
      verificationSteps: [],
      expectedSummaryFormat: "Summary"
    },
    generatedPrompt: "Prompt",
    redactionFindings: [],
    deliveryAttemptIds: [],
    artifactIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createExistingThreadTarget(integrationMode: "deepLink" | "appServer"): CodexDeepLinkTarget {
  return {
    id: "target_existing",
    kind: "codexDeepLink",
    repoPath: tempDir,
    existingThreadId: "thread_123",
    existingThreadName: "Existing task",
    openMode: "existingThread",
    integrationMode,
    boundAt: "2026-01-01T00:00:00.000Z"
  };
}
