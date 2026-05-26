import { mkdir, rm, writeFile } from "node:fs/promises";
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
    expect(workspace.branchName).toBe("agentbridge/mission-branch");
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
});

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, { cwd, windowsHide: true });
}
