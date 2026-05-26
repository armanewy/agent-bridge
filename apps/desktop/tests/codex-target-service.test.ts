import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { CodexTargetService } from "../src/services/codex-target-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CodexTargetService", () => {
  it("creates valid Codex targets", async () => {
    const service = new CodexTargetService(new JsonFileStore(tempDir));
    const target = await service.configureTarget(tempDir);

    expect(target.kind).toBe("codexDeepLink");
    expect(target.repoPath).toBe(tempDir);
  });

  it("supports dry-run delivery without opening Codex", async () => {
    const service = new CodexTargetService(new JsonFileStore(tempDir));
    const target = await service.configureTarget(tempDir);
    const result = await service.deliver({ target, prompt: "Fix it", dryRun: true });

    expect(result.deepLink).toContain("codex://threads/new?");
    expect(result.promptLength).toBe(6);
  });
});
