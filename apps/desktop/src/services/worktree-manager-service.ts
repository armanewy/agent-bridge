import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { MissionWorkspace, MissionWorkspaceStrategy } from "@agentbridge/core";

export class WorktreeManagerService {
  private readonly workspaces = new Map<string, MissionWorkspace>();

  async createMissionWorkspace(input: {
    missionId: string;
    baseRepoPath: string;
    strategy: MissionWorkspaceStrategy;
    baseBranch?: string;
  }): Promise<MissionWorkspace> {
    const now = new Date().toISOString();
    const suffix = safeName(input.missionId);
    if (input.strategy === "none") {
      const workspace: MissionWorkspace = {
        id: `workspace_${randomUUID()}`,
        missionId: input.missionId,
        baseRepoPath: input.baseRepoPath,
        workingPath: input.baseRepoPath,
        strategy: "none",
        ...(input.baseBranch ? { baseBranch: input.baseBranch } : {}),
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      this.workspaces.set(workspace.id, workspace);
      return workspace;
    }

    const branchName = `agentbridge/${suffix}`;
    const workingPath = input.strategy === "gitWorktree" ? join(input.baseRepoPath, "..", `.agentbridge-${suffix}`) : input.baseRepoPath;
    if (input.strategy === "branch") {
      await runGit(input.baseRepoPath, ["checkout", "-B", branchName]);
    } else {
      await runGit(input.baseRepoPath, ["worktree", "add", "-b", branchName, workingPath]);
    }
    const workspace: MissionWorkspace = {
      id: `workspace_${randomUUID()}`,
      missionId: input.missionId,
      baseRepoPath: input.baseRepoPath,
      workingPath,
      strategy: input.strategy,
      ...(input.baseBranch ? { baseBranch: input.baseBranch } : {}),
      branchName,
      ...(input.strategy === "gitWorktree" ? { worktreeName: `.agentbridge-${suffix}` } : {}),
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async getMissionWorkspace(missionId: string): Promise<MissionWorkspace | undefined> {
    return [...this.workspaces.values()].find((workspace) => workspace.missionId === missionId);
  }

  async detectChangedFiles(workspaceIdOrPath: string): Promise<string[]> {
    const workspace = this.workspaces.get(workspaceIdOrPath);
    const output = await runGit(workspace?.workingPath ?? workspaceIdOrPath, ["status", "--short"]);
    return output.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean);
  }

  async detectConflictCandidates(workspaceIdOrPath: string): Promise<string[]> {
    const changedFiles = await this.detectChangedFiles(workspaceIdOrPath);
    return changedFiles.filter((file) => file.includes(" ") || file.includes(".."));
  }

  async markMerged(workspaceId: string): Promise<MissionWorkspace | undefined> {
    return this.updateStatus(workspaceId, "merged");
  }

  async abandonWorkspace(workspaceId: string): Promise<MissionWorkspace | undefined> {
    return this.updateStatus(workspaceId, "abandoned");
  }

  async cleanupWorkspace(workspaceId: string): Promise<MissionWorkspace | undefined> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return undefined;
    }
    return this.updateStatus(workspaceId, "abandoned");
  }

  private updateStatus(workspaceId: string, status: MissionWorkspace["status"]): MissionWorkspace | undefined {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return undefined;
    }
    const updated = { ...workspace, status, updatedAt: new Date().toISOString() };
    this.workspaces.set(workspaceId, updated);
    return updated;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const child = spawn("git", args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const stdoutPromise = stream(child.stdout);
  const stderrPromise = stream(child.stderr);
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (code !== 0) throw new Error(stderr || `git ${args.join(" ")} failed with ${code}`);
  return stdout;
}

function stream(readable: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    readable.setEncoding("utf8");
    readable.on("data", (chunk) => { output += chunk; });
    readable.on("error", reject);
    readable.on("end", () => resolve(output));
  });
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "mission";
}
