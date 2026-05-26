import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { HandoffCard, Mission } from "@agentbridge/core";
import { CodexTargetService } from "../src/services/codex-target-service.js";
import { HandoffCardDeliveryService } from "../src/services/handoff-card-delivery-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-card-delivery-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("HandoffCardDeliveryService", () => {
  it("dry-runs a draft card through Codex delivery", async () => {
    const store = new JsonFileStore(tempDir);
    const target = await new CodexTargetService(store).configureTarget(tempDir);
    await store.saveMission(createMission());
    await store.saveHandoffCard(createCard(target.id));

    const result = await new HandoffCardDeliveryService(store, new CodexTargetService(store)).deliverToCodex({
      missionId: "mission_1",
      handoffCardId: "card_1",
      dryRun: true
    });

    expect(result.success).toBe(true);
    await expect(store.getHandoffCard("card_1")).resolves.toMatchObject({ deliveryAttemptIds: [expect.any(String)] });
  });
});

function createMission(): Mission {
  return {
    id: "mission_1",
    title: "Mission",
    goal: "Deliver card",
    status: "failed",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: ["card_1"],
    artifactIds: [],
    runIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createCard(targetId: string): HandoffCard {
  return {
    id: "card_1",
    missionId: "mission_1",
    sourceId: "source_1",
    captureId: "capture_1",
    targetId,
    recipe: "debuggingRequest",
    taskSpec: {
      title: "Follow-up",
      goal: "Fix failure",
      background: "Verification failed.",
      instructions: [],
      requirements: [],
      constraints: [],
      nonGoals: [],
      acceptanceCriteria: [],
      suggestedFiles: [],
      verificationSteps: [],
      expectedSummaryFormat: "Summary"
    },
    generatedPrompt: "Fix the failed verification.",
    redactionFindings: [],
    deliveryAttemptIds: [],
    artifactIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
