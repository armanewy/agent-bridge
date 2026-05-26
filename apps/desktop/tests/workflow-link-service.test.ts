import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browserTabComponent, codexTargetComponent, repoComponent } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { TransformService } from "../src/services/transform-service.js";
import { WorkflowLinkService } from "../src/services/workflow-link-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-workflow-link-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorkflowLinkService", () => {
  it("creates a workflow link and turns the latest capture into a task preview", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const source = {
      id: "src_1",
      kind: "browserTab" as const,
      browser: "chrome" as const,
      title: "ChatGPT - Notes",
      url: "https://chatgpt.com/",
      boundAt: now
    };
    const target = {
      id: "target_1",
      kind: "codexDeepLink" as const,
      repoPath: tempDir,
      openMode: "newThread" as const,
      boundAt: now
    };
    const sourceComponent = browserTabComponent(source);
    const targetComponent = codexTargetComponent(target);
    const workspaceComponent = repoComponent({ repoPath: tempDir, repoName: "repo", testCommand: "pnpm test" }, "repo_1");

    await store.saveSource(source);
    await store.saveTarget(target);
    await store.saveLinkableComponent(sourceComponent);
    await store.saveLinkableComponent(targetComponent);
    await store.saveLinkableComponent(workspaceComponent);
    await store.saveCapture({
      id: "cap_1",
      sourceId: source.id,
      captureType: "selectedText",
      text: "Please implement the link center.",
      metadata: {},
      createdAt: now,
      userTriggered: true
    });

    const service = new WorkflowLinkService(store, new TransformService(store));
    const link = await service.createWorkflowLink({
      name: "ChatGPT to Codex",
      sourceComponentId: sourceComponent.id,
      workspaceComponentId: workspaceComponent.id,
      targetComponentId: targetComponent.id,
      recipe: "implementationBrief",
      codexThreadId: "thread_123",
      codexThreadName: "Existing task",
      codexOpenMode: "existingThread",
      codexIntegrationMode: "deepLink"
    });
    const preview = await service.createTaskFromWorkflowLink({ workflowLinkId: link.id });

    expect(preview.handoffCard.sourceId).toBe(source.id);
    expect(preview.handoffCard.targetId).toBe(target.id);
    expect(preview.handoffCard.codexThreadId).toBe("thread_123");
    expect(preview.handoffCard.codexDeliveryMode).toBe("existingThread");
    expect(preview.taskSpec.title).toBeTruthy();
  });

  it("blocks task creation when the source has no capture", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const sourceComponent = browserTabComponent({
      id: "src_1",
      kind: "browserTab",
      browser: "chrome",
      title: "ChatGPT",
      url: "https://chatgpt.com/",
      boundAt: now
    });
    const target = {
      id: "target_1",
      kind: "codexDeepLink" as const,
      repoPath: tempDir,
      openMode: "newThread" as const,
      boundAt: now
    };
    const targetComponent = codexTargetComponent(target);
    const workspaceComponent = repoComponent({ repoPath: tempDir, repoName: "repo" }, "repo_1");

    await store.saveTarget(target);
    await store.saveLinkableComponent(sourceComponent);
    await store.saveLinkableComponent(targetComponent);
    await store.saveLinkableComponent(workspaceComponent);

    const service = new WorkflowLinkService(store, new TransformService(store));
    const link = await service.createWorkflowLink({
      name: "ChatGPT to Codex",
      sourceComponentId: sourceComponent.id,
      workspaceComponentId: workspaceComponent.id,
      targetComponentId: targetComponent.id,
      recipe: "implementationBrief"
    });

    await expect(service.createTaskFromWorkflowLink({ workflowLinkId: link.id })).rejects.toThrow("Capture selected text first");
  });

  it("creates a task from a discovered tab component matched by tab metadata", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const discoveredSource = browserTabComponent({
      id: "src_discovered",
      kind: "browserTab",
      browser: "chrome",
      tabId: 9,
      windowId: 1,
      title: "ChatGPT - Notes",
      url: "https://chatgpt.com/",
      boundAt: now
    });
    const sourceComponent = {
      ...discoveredSource,
      id: "component_browser_chrome_1_9",
      backingRef: { tabId: 9, windowId: 1 }
    };
    const target = {
      id: "target_1",
      kind: "codexDeepLink" as const,
      repoPath: tempDir,
      openMode: "newThread" as const,
      boundAt: now
    };
    const targetComponent = codexTargetComponent(target);
    const workspaceComponent = repoComponent({ repoPath: tempDir, repoName: "repo" }, "repo_1");

    await store.saveTarget(target);
    await store.saveLinkableComponent(sourceComponent);
    await store.saveLinkableComponent(targetComponent);
    await store.saveLinkableComponent(workspaceComponent);
    await store.saveCapture({
      id: "cap_1",
      sourceId: "src_runtime_capture",
      captureType: "selectedText",
      text: "Create the Link Center task flow.",
      metadata: { source: { tabId: 9, url: "https://chatgpt.com/" } },
      createdAt: now,
      userTriggered: true
    });

    const service = new WorkflowLinkService(store, new TransformService(store));
    const link = await service.createWorkflowLink({
      name: "Discovered ChatGPT to Codex",
      sourceComponentId: sourceComponent.id,
      workspaceComponentId: workspaceComponent.id,
      targetComponentId: targetComponent.id,
      recipe: "implementationBrief"
    });
    const preview = await service.createTaskFromWorkflowLink({ workflowLinkId: link.id });

    expect(preview.handoffCard.captureId).toBe("cap_1");
    expect(preview.handoffCard.targetId).toBe(target.id);
  });
});
