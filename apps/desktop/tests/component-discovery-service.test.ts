import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { ComponentDiscoveryService } from "../src/services/component-discovery-service.js";
import type { WindowsTargetService } from "../src/services/windows-target-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-components-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe("ComponentDiscoveryService", () => {
  it("discovers Codex App Server threads, repos, and desktop windows", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    await store.saveCodexThreadRef({
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Existing AgentBridge work",
      repoPath: tempDir,
      status: "idle",
      source: "appServer",
      lastSeenAt: now,
      metadata: {}
    });

    const windows = {
      async listTopLevelWindows() {
        return [
          {
            id: "target_windows_123",
            kind: "windowsDesktopWindow",
            hwnd: "123",
            title: "Windows Terminal",
            executablePath: "C:/Windows/System32/WindowsTerminal.exe",
            boundAt: now
          },
          {
            id: "target_windows_456",
            kind: "windowsDesktopWindow",
            hwnd: "456",
            title: "ChatGPT",
            executablePath: "C:/Users/example/AppData/Local/Programs/ChatGPT/ChatGPT.exe",
            boundAt: now
          }
          ];
      }
    } as Pick<WindowsTargetService, "listTopLevelWindows"> as WindowsTargetService;

    const result = await new ComponentDiscoveryService(store, windows).discover();

    expect(result.components.some((component) => component.provider === "codexThread" && component.backingRef.codexThreadId === "thread_123")).toBe(true);
    expect(result.components.some((component) => component.kind === "repo")).toBe(true);
    expect(result.components.some((component) => component.provider === "terminal" && component.riskLevel === "high")).toBe(true);
  });

  it("persists derived Codex thread and repo components during listing", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    await store.saveCodexThreadRef({
      id: "codex_thread_1",
      threadId: "thread_123",
      repoPath: tempDir,
      status: "idle",
      source: "appServer",
      lastSeenAt: now,
      metadata: {}
    });

    const windows = {
      async listTopLevelWindows() {
        return [];
      }
    } as Pick<WindowsTargetService, "listTopLevelWindows"> as WindowsTargetService;

    const service = new ComponentDiscoveryService(store, windows);
    const components = await service.listComponents();
    const stored = await store.listLinkableComponents();

    expect(components.some((component) => component.provider === "codexThread")).toBe(true);
    expect(stored.some((component) => component.provider === "codexThread")).toBe(true);
  });
});
