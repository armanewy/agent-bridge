import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { HandoffCard, Mission } from "@agentbridge/core";
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
