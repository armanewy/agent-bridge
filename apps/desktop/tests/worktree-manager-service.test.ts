import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { WorktreeManagerService } from "../src/services/worktree-manager-service.js";

const execFileAsync = promisify(execFile);
let tempDir: string;
let repoPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-worktree-"));
  repoPath = join(tempDir, "repo");
  await mkdir(repoPath, { recursive: true });
  await git(["init"], repoPath);
  await git(["config", "user.email", "agentbridge@example.com"], repoPath);
  await git(["config", "user.name", "AgentBridge Tests"], repoPath);
  await writeFile(join(repoPath, "README.md"), "hello\n", "utf8");
  await git(["add", "README.md"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorktreeManagerService", () => {
  it("creates a mission branch", async () => {
    const service = new WorktreeManagerService();

    const workspace = await service.createMissionWorkspace({
      missionId: "mission branch",
      baseRepoPath: repoPath,
      strategy: "branch"
    });

    expect(workspace.strategy).toBe("branch");
    expect(workspace.branchName).toBe("agentbridge/mission-branch-branch");
  });

  it("creates a git worktree and detects changed files", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorktreeManagerService(store);
    const workspace = await service.createMissionWorkspace({
      missionId: "mission worktree",
      baseRepoPath: repoPath,
      strategy: "gitWorktree"
    });

    await writeFile(join(workspace.workingPath, "changed.txt"), "changed\n", "utf8");

    expect(workspace.strategy).toBe("gitWorktree");
    await expect(store.getMissionWorkspace(workspace.id)).resolves.toEqual(workspace);
    expect(await service.detectChangedFiles(workspace.id)).toContain("changed.txt");
    expect(await service.abandonWorkspace(workspace.id)).toMatchObject({ status: "abandoned" });
  });

  it("creates worktrees from the requested base branch and removes them on cleanup", async () => {
    await git(["checkout", "-b", "feature-base"], repoPath);
    await writeFile(join(repoPath, "feature.txt"), "feature\n", "utf8");
    await git(["add", "feature.txt"], repoPath);
    await git(["commit", "-m", "feature base"], repoPath);
    await git(["checkout", "master"], repoPath);
    const store = new JsonFileStore(tempDir);
    const service = new WorktreeManagerService(store);

    const workspace = await service.createMissionWorkspace({
      missionId: "mission cleanup",
      baseRepoPath: repoPath,
      strategy: "gitWorktree",
      baseBranch: "feature-base"
    });

    await expect(access(join(workspace.workingPath, "feature.txt"))).resolves.toBeUndefined();
    await expect(service.cleanupWorkspace(workspace.id)).resolves.toMatchObject({ status: "abandoned" });
    await expect(access(workspace.workingPath)).rejects.toThrow();
  });

  it("uses the mission title for readable worktree names", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission({
      id: "mission_12345678-aaaa-bbbb-cccc-123456789abc",
      title: "Add regression coverage for missing evidence",
      goal: "Add regression coverage for missing evidence",
      status: "draft",
      sourceIds: [],
      captureIds: [],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const service = new WorktreeManagerService(store);

    const workspace = await service.createMissionWorkspace({
      missionId: "mission_12345678-aaaa-bbbb-cccc-123456789abc",
      baseRepoPath: repoPath,
      strategy: "gitWorktree"
    });

    expect(workspace.worktreeName).toBe(".agentbridge-add-regression-coverage-missing-evidence-12345678");
    expect(workspace.branchName).toBe("agentbridge/add-regression-coverage-missing-evidence-12345678");
  });

  it("blocks isolated workspace creation from a dirty base repository", async () => {
    const service = new WorktreeManagerService();
    await writeFile(join(repoPath, "dirty.txt"), "dirty\n", "utf8");

    await expect(service.createMissionWorkspace({
      missionId: "mission dirty",
      baseRepoPath: repoPath,
      strategy: "gitWorktree"
    })).rejects.toThrow("uncommitted changes");
  });

  it("blocks git worktree path collisions", async () => {
    const service = new WorktreeManagerService();
    await mkdir(join(tempDir, ".agentbridge-mission-collision-collisio"));

    await expect(service.createMissionWorkspace({
      missionId: "mission collision",
      baseRepoPath: repoPath,
      strategy: "gitWorktree"
    })).rejects.toThrow("already exists");
  });
});

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}
