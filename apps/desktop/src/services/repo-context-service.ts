import { access, stat } from "node:fs/promises";
import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RepoContextPack } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

const execFileAsync = promisify(execFile);

export interface RepoCommandConfig {
  testCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
}

export class RepoContextService {
  constructor(private readonly store?: Pick<LocalStore, "getSetting">) {}

  async build(repoPath: string, commands?: RepoCommandConfig): Promise<RepoContextPack> {
    await access(repoPath);
    const stats = await stat(repoPath);
    if (!stats.isDirectory()) {
      throw new Error("Repository path must be a directory.");
    }

    const persisted = await this.store?.getSetting<RepoCommandConfig>(settingsKey(repoPath));
    const resolvedCommands = { ...persisted, ...commands };
    const gitInfo = await readGitInfo(repoPath);

    return {
      repoPath,
      repoName: basename(repoPath),
      worktreePath: repoPath,
      ...(gitInfo.currentBranch ? { currentBranch: gitInfo.currentBranch } : {}),
      ...(gitInfo.gitStatusSummary ? { gitStatusSummary: gitInfo.gitStatusSummary } : {}),
      ...(gitInfo.changedFiles ? { changedFiles: gitInfo.changedFiles } : {}),
      ...(resolvedCommands.testCommand ? { testCommand: resolvedCommands.testCommand } : {}),
      ...(resolvedCommands.lintCommand ? { lintCommand: resolvedCommands.lintCommand } : {}),
      ...(resolvedCommands.typecheckCommand ? { typecheckCommand: resolvedCommands.typecheckCommand } : {})
    };
  }
}

export function repoCommandSettingsKey(repoPath: string): string {
  return settingsKey(repoPath);
}

async function readGitInfo(repoPath: string): Promise<{
  currentBranch?: string;
  gitStatusSummary?: string;
  changedFiles?: string[];
}> {
  try {
    const [{ stdout: branchStdout }, { stdout: statusStdout }] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "branch", "--show-current"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "status", "--short"], { windowsHide: true })
    ]);
    const changedFiles = statusStdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);

    const currentBranch = branchStdout.trim();
    return {
      ...(currentBranch ? { currentBranch } : {}),
      gitStatusSummary: changedFiles.length === 0 ? "clean" : `${changedFiles.length} changed file(s)`,
      changedFiles
    };
  } catch {
    return {
      gitStatusSummary: "not a git repository",
      changedFiles: []
    };
  }
}

function settingsKey(repoPath: string): string {
  return `repoContext:${repoPath}`;
}
