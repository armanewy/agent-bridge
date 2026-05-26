import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { HandoffCard, Mission, TaskSpec } from "@agentbridge/core";
import { VerificationService, type CommandRunner } from "../src/services/verification-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-verification-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("VerificationService", () => {
  it("marks verification passed when configured commands pass", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({ testCommand: "pnpm test" }));
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 5 });

    const response = await new VerificationService(store, runner).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("passed");
    expect(response.result.commandResults).toMatchObject([{ kind: "test", status: "passed" }]);
    expect(response.artifacts.some((artifact) => artifact.kind === "testOutput")).toBe(true);
    expect(response.artifacts.some((artifact) => artifact.kind === "reviewNote")).toBe(true);
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "passed" });
  });

  it("marks verification failed when a command fails", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({ lintCommand: "pnpm lint" }));
    await store.saveHandoffCard(createHandoffCard());
    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "lint failed", durationMs: 7 });

    const response = await new VerificationService(store, runner).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("failed");
    expect(response.result.summary).toContain("lint");
    expect(response.artifacts.some((artifact) => artifact.title === "Follow-up prompt draft")).toBe(true);
    await expect(store.listHandoffCardsForMission("mission_1")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ recipe: "debuggingRequest" })])
    );
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "failed" });
  });

  it("requires review when no commands are configured", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({}));

    const response = await new VerificationService(store).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("needs_review");
    expect(response.artifacts.map((artifact) => artifact.kind)).toEqual(["gitDiff", "reviewNote"]);
  });
});

function createMission(commands: {
  testCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
}): Mission {
  return {
    id: "mission_1",
    title: "Mission",
    goal: "Verify work",
    status: "delivered",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: [],
    artifactIds: [],
    runIds: [],
    repoContext: {
      repoPath: tempDir,
      repoName: "repo",
      ...commands
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createTaskSpec(): TaskSpec {
  return {
    title: "Original task",
    goal: "Do the work",
    background: "Original background",
    instructions: ["Use existing patterns."],
    requirements: ["Implement the requested change."],
    constraints: ["Keep scope tight."],
    nonGoals: ["No provider expansion."],
    acceptanceCriteria: ["Tests pass."],
    suggestedFiles: [],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary and verification."
  };
}

function createHandoffCard(): HandoffCard {
  return {
    id: "card_1",
    missionId: "mission_1",
    sourceId: "source_1",
    captureId: "capture_1",
    targetId: "target_1",
    recipe: "implementationBrief",
    taskSpec: createTaskSpec(),
    generatedPrompt: "Original prompt",
    redactionFindings: [],
    deliveryAttemptIds: [],
    artifactIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
