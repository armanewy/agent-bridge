import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MissionWorkspace, MissionWorkspaceStrategy } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export class WorktreeManagerService {
  private readonly workspaces = new Map<string, MissionWorkspace>();

  constructor(private readonly store?: LocalStore, private readonly worktreeRoot?: string) {}

  async createMissionWorkspace(input: {
    missionId: string;
    baseRepoPath: string;
    strategy: MissionWorkspaceStrategy;
    baseBranch?: string;
  }): Promise<MissionWorkspace> {
    const now = new Date().toISOString();
    const mission = await this.store?.getMission(input.missionId);
    const suffix = safeMissionWorkspaceName(mission?.title ?? mission?.goal ?? input.missionId, input.missionId);
    await ensureGitRepo(input.baseRepoPath);

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
      await this.store?.saveMissionWorkspace(workspace);
      return workspace;
    }

    const branchName = `agentbridge/${suffix}`;
    const root = this.worktreeRoot ?? join(input.baseRepoPath, "..");
    const workingPath = input.strategy === "gitWorktree" ? join(root, `.agentbridge-${suffix}`) : input.baseRepoPath;
    await ensureCleanWorkingTree(input.baseRepoPath);
    if (input.strategy === "gitWorktree") {
      await mkdir(root, { recursive: true });
    }
    if (input.strategy === "gitWorktree" && existsSync(workingPath)) {
      throw new Error(`Mission worktree path already exists: ${workingPath}`);
    }
    if (input.strategy === "branch") {
      await runGit(input.baseRepoPath, ["checkout", "-b", branchName]);
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
    await this.store?.saveMissionWorkspace(workspace);
    return workspace;
  }

  async getMissionWorkspace(missionId: string): Promise<MissionWorkspace | undefined> {
    const stored = await this.store?.listMissionWorkspaces(missionId);
    return stored?.[0] ?? [...this.workspaces.values()].find((workspace) => workspace.missionId === missionId);
  }

  async detectChangedFiles(workspaceIdOrPath: string): Promise<string[]> {
    const workspace = this.workspaces.get(workspaceIdOrPath) ?? await this.store?.getMissionWorkspace(workspaceIdOrPath);
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

  private async updateStatus(workspaceId: string, status: MissionWorkspace["status"]): Promise<MissionWorkspace | undefined> {
    const workspace = this.workspaces.get(workspaceId) ?? await this.store?.getMissionWorkspace(workspaceId);
    if (!workspace) {
      return undefined;
    }
    const updated = { ...workspace, status, updatedAt: new Date().toISOString() };
    this.workspaces.set(workspaceId, updated);
    await this.store?.saveMissionWorkspace(updated);
    return updated;
  }
}

async function ensureGitRepo(cwd: string): Promise<void> {
  await runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

async function ensureCleanWorkingTree(cwd: string): Promise<void> {
  const status = await runGit(cwd, ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error("Base repository has uncommitted changes. Commit or stash them before creating an isolated mission workspace.");
  }
  const branch = (await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (!branch || branch === "HEAD") {
    throw new Error("Cannot create mission workspace from detached HEAD.");
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

function safeMissionWorkspaceName(label: string, missionId: string): string {
  const readable = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .split("-")
    .filter((part) => !STOP_WORDS.has(part))
    .slice(0, 5)
    .join("-");
  const unique = missionId.replace(/^mission[_-]?/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return [readable || "mission", unique].filter(Boolean).join("-").slice(0, 64);
}

const STOP_WORDS = new Set(["a", "an", "and", "as", "for", "in", "of", "the", "to", "when", "with"]);
