import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { CompletionContract, HandoffCard, Mission, TaskSpec } from "@agentbridge/core";
import { VerificationService, type CommandRunner } from "../src/services/verification-service.js";

let tempDir: string;
const execFileAsync = promisify(execFile);

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
    await store.saveCompletionContract(createCompletionContract("command"));
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 5 });

    const response = await new VerificationService(store, runner).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("passed");
    expect(response.result.commandResults).toMatchObject([{ kind: "test", status: "passed" }]);
    expect(response.artifacts.some((artifact) => artifact.kind === "testOutput")).toBe(true);
    expect(response.artifacts.some((artifact) => artifact.kind === "reviewNote")).toBe(true);
    await expect(store.listCompletionEvidenceForContract("contract_1")).resolves.toEqual([
      expect.objectContaining({ kind: "command", status: "passed" })
    ]);
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "passed" });
  });

  it("marks verification failed when a command fails", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({ lintCommand: "pnpm lint" }));
    await store.saveCompletionContract(createCompletionContract("command"));
    await store.saveHandoffCard(createHandoffCard());
    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: "", stderr: "lint failed", durationMs: 7 });

    const response = await new VerificationService(store, runner).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("failed");
    expect(response.result.summary).toContain("lint");
    expect(response.artifacts.some((artifact) => artifact.title === "Follow-up prompt draft")).toBe(true);
    await expect(store.listCompletionEvidenceForContract("contract_1")).resolves.toEqual([
      expect.objectContaining({ kind: "command", status: "failed" })
    ]);
    await expect(store.listHandoffCardsForMission("mission_1")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ recipe: "debuggingRequest" })])
    );
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "failed" });
  });

  it("requires review when no commands are configured", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({}));
    await store.saveCompletionContract(createCompletionContract("visual"));

    const response = await new VerificationService(store).runVerification({ missionId: "mission_1" });

    expect(response.result.status).toBe("needs_review");
    expect(response.artifacts.map((artifact) => artifact.kind)).toEqual(["gitDiff", "reviewNote"]);
    await expect(store.listCompletionEvidenceForContract("contract_1")).resolves.toEqual([
      expect.objectContaining({ kind: "visual", status: "missing" })
    ]);
    await expect(store.getMission("mission_1")).resolves.toMatchObject({ status: "needs_review" });
  });

  it("records changed file ownership for mission workspaces", async () => {
    const repoPath = join(tempDir, "repo");
    await mkdir(repoPath, { recursive: true });
    await git(["init"], repoPath);
    await git(["config", "user.email", "agentbridge@example.com"], repoPath);
    await git(["config", "user.name", "AgentBridge Tests"], repoPath);
    await writeFile(join(repoPath, "README.md"), "hello\n", "utf8");
    await git(["add", "README.md"], repoPath);
    await git(["commit", "-m", "initial"], repoPath);
    await writeFile(join(repoPath, "README.md"), "changed\n", "utf8");
    const store = new JsonFileStore(tempDir);
    await store.saveMission({
      ...createMission({}),
      repoContext: { repoPath, repoName: "repo" }
    });
    await store.saveMissionWorkspace({
      id: "workspace_1",
      missionId: "mission_1",
      baseRepoPath: repoPath,
      workingPath: repoPath,
      strategy: "none",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    await new VerificationService(store).runVerification({ missionId: "mission_1" });

    await expect(store.listFileOwnershipForMission("mission_1")).resolves.toEqual([
      expect.objectContaining({ relativePath: "README.md", status: "changed" })
    ]);
    await expect(store.getMissionWorkspace("workspace_1")).resolves.toMatchObject({ status: "dirty" });
  });

  it("includes staged and untracked files in git diff evidence", async () => {
    const repoPath = join(tempDir, "repo");
    await mkdir(repoPath, { recursive: true });
    await git(["init"], repoPath);
    await git(["config", "user.email", "agentbridge@example.com"], repoPath);
    await git(["config", "user.name", "AgentBridge Tests"], repoPath);
    await writeFile(join(repoPath, "README.md"), "hello\n", "utf8");
    await git(["add", "README.md"], repoPath);
    await git(["commit", "-m", "initial"], repoPath);
    await writeFile(join(repoPath, "README.md"), "staged\n", "utf8");
    await git(["add", "README.md"], repoPath);
    await writeFile(join(repoPath, "new-test.md"), "untracked\n", "utf8");
    const store = new JsonFileStore(tempDir);
    await store.saveMission({
      ...createMission({}),
      repoContext: { repoPath, repoName: "repo" }
    });
    await store.saveMissionWorkspace({
      id: "workspace_1",
      missionId: "mission_1",
      baseRepoPath: repoPath,
      workingPath: repoPath,
      strategy: "none",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const response = await new VerificationService(store).runVerification({ missionId: "mission_1" });
    const gitDiff = response.artifacts.find((artifact) => artifact.kind === "gitDiff");

    expect(gitDiff?.metadata.changedFiles).toEqual(expect.arrayContaining(["README.md", "new-test.md"]));
    await expect(store.listFileOwnershipForMission("mission_1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relativePath: "README.md" }),
        expect.objectContaining({ relativePath: "new-test.md" })
      ])
    );
  });

  it("rejects verification command cwd outside the mission repo", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(createMission({}));
    const outsidePath = join(tempDir, "..");
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 });

    await expect(
      new VerificationService(store, runner).runVerification({
        missionId: "mission_1",
        commands: [{ kind: "custom", command: "echo nope", cwd: outsidePath }]
      })
    ).rejects.toThrow("cwd must stay inside");
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
    inputArtifactId: "artifact_1",
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

function createCompletionContract(kind: "command" | "visual"): CompletionContract {
  return {
    id: "contract_1",
    missionId: "mission_1",
    goal: "Verify work",
    scope: [],
    nonGoals: [],
    acceptanceCriteria: [
      {
        id: "criterion_1",
        statement: kind === "command" ? "Configured commands pass." : "Workbench screenshot looks correct.",
        evidenceRequired: kind === "command" ? "Command output." : "Screenshot.",
        verifierKind: kind,
        required: true
      }
    ],
    verificationMethods: [
      {
        id: "method_1",
        kind,
        description: kind === "command" ? "Run configured verification commands." : "Provide a screenshot."
      }
    ],
    stopConditions: [],
    humanReviewTriggers: [],
    status: "valid",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}
