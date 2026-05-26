import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { RepoContextService } from "../src/services/repo-context-service.js";

const execFileAsync = promisify(execFile);
let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `agentbridge-repo-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("RepoContextService", () => {
  it("handles non-git paths gracefully", async () => {
    const context = await new RepoContextService().build(tempDir);

    expect(context.repoPath).toBe(tempDir);
    expect(context.gitStatusSummary).toBe("not a git repository");
  });

  it("detects branch and changed files in a git repo", async () => {
    await execFileAsync("git", ["init"], { cwd: tempDir, windowsHide: true });
    await execFileAsync("git", ["checkout", "-b", "main"], { cwd: tempDir, windowsHide: true });
    await writeFile(join(tempDir, "README.md"), "hello\n", "utf8");

    const context = await new RepoContextService().build(tempDir, {
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      typecheckCommand: "pnpm build"
    });

    expect(context.currentBranch).toBe("main");
    expect(context.changedFiles).toContain("README.md");
    expect(context.testCommand).toBe("pnpm test");
  });
});
