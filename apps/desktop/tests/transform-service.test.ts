import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { BrowserTabSource, Capture, CodexDeepLinkTarget } from "@agentbridge/core";
import { TransformService } from "../src/services/transform-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-transform-"));
});

afterEach(async () => {
  await removeTempDir(tempDir);
});

describe("TransformService", () => {
  it("saves HandoffCard before delivery", async () => {
    const store = new JsonFileStore(tempDir);
    await seed(store, "Build a mission task card.");
    const preview = await new TransformService(store).previewHandoff({
      captureId: "cap_1",
      targetId: "target_1",
      recipe: "implementationBrief"
    });

    expect(preview.taskSpec.goal).toContain("Implement");
    await expect(store.listHandoffCardsForMission(preview.mission.id)).resolves.toHaveLength(1);
    await expect(store.listArtifactsForHandoffCard(preview.handoffCard.id)).resolves.toHaveLength(3);
  });

  it("runs redaction scanning on generated prompt", async () => {
    const store = new JsonFileStore(tempDir);
    await seed(store, "Use Bearer abcdefghijklmnopqrstuvwxyz12345");
    const preview = await new TransformService(store).previewHandoff({
      captureId: "cap_1",
      targetId: "target_1",
      recipe: "rawRelay"
    });

    expect(preview.handoffCard.redactionFindings[0]?.kind).toBe("bearerToken");
  });
});

async function seed(store: JsonFileStore, text: string): Promise<void> {
  const source: BrowserTabSource = {
    id: "src_1",
    kind: "browserTab",
    browser: "chrome",
    title: "Captured tab",
    url: "https://example.com",
    boundAt: "2026-01-01T00:00:00.000Z"
  };
  const capture: Capture = {
    id: "cap_1",
    sourceId: source.id,
    captureType: "selectedText",
    text,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    userTriggered: true
  };
  const target: CodexDeepLinkTarget = {
    id: "target_1",
    kind: "codexDeepLink",
    repoPath: tempDir,
    openMode: "newThread",
    boundAt: "2026-01-01T00:00:00.000Z"
  };

  await store.saveSource(source);
  await store.saveCapture(capture);
  await store.saveTarget(target);
}

async function removeTempDir(path: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
