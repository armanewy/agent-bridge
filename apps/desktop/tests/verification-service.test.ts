import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { Mission } from "@agentbridge/core";
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
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "passed" });
  });

  it("marks verification failed when a command fails", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({ lintCommand: "pnpm lint" }));
    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "lint failed", durationMs: 7 });

    const response = await new VerificationService(store, runner).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("failed");
    expect(response.result.summary).toContain("lint");
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "failed" });
  });

  it("requires review when no commands are configured", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({}));

    const response = await new VerificationService(store).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("needs_review");
    expect(response.artifacts).toHaveLength(1);
    expect(response.artifacts[0]?.kind).toBe("gitDiff");
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
