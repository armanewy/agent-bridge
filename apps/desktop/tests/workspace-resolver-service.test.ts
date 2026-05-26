import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodexDeepLinkTarget, type Mission } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { WorkspaceResolverService } from "../src/services/workspace-resolver-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-workspace-resolver-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorkspaceResolverService", () => {
  it("infers high-confidence workspace from Codex thread repoPath", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorkspaceResolverService(store, fixedNow);

    const candidates = service.inferFromCodexThreadRef({
      id: "ref_1",
      threadId: "thread_1",
      repoPath: "C:/repo/agent-bridge",
      status: "idle",
      source: "appServer",
      lastSeenAt: fixedNow(),
      metadata: {}
    });

    expect(candidates[0]).toMatchObject({ source: "codexAppServerThread", confidence: 95, requiresConfirmation: false });
  });

  it("infers high-confidence workspace from Codex deep-link target", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorkspaceResolverService(store, fixedNow);

    const candidates = service.inferFromCodexDeepLinkTarget(createCodexDeepLinkTarget({ id: "target_1", repoPath: "C:/repo/app" }));

    expect(candidates[0]).toMatchObject({ source: "codexDeepLinkTarget", repoName: "app", confidence: 95 });
  });

  it("detects GitHub URLs without local repo reads", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorkspaceResolverService(store, fixedNow);

    const candidates = service.inferFromText("Fix https://github.com/armanewy/agent-bridge issue.");

    expect(candidates[0]).toMatchObject({
      source: "githubUrl",
      repoName: "armanewy/agent-bridge",
      remoteUrl: "https://github.com/armanewy/agent-bridge",
      confidence: 80,
      requiresConfirmation: true
    });
  });

  it("does not block bridge mode for low-confidence title hints", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new WorkspaceResolverService(store, fixedNow);

    const candidates = service.inferFromText("Simplify agent-bridge UI");

    expect(candidates[0]).toMatchObject({ confidence: 50, requiresConfirmation: true });
    expect(service.getBestCandidate(candidates)?.confidence).toBeLessThan(70);
  });

  it("infers for a mission from stored Codex target and prior mission", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveTarget(createCodexDeepLinkTarget({ id: "target_1", repoPath: "C:/repo/app" }));
    await store.saveMission(mission("mission_1"));
    await store.saveMission({ ...mission("mission_2"), repoContext: { repoPath: "C:/repo/history", currentBranch: "main", changedFiles: [] } });
    const service = new WorkspaceResolverService(store, fixedNow);

    const candidates = await service.inferForMission("mission_1");

    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ repoPath: "C:/repo/app" })]));
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ repoPath: "C:/repo/history" })]));
  });
});

function mission(id: string): Mission {
  return {
    id,
    title: "Mission",
    goal: "Do the work.",
    status: "draft",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: [],
    artifactIds: [],
    runIds: [],
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
