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
  await rm(tempDir, { recursive: true, force: true });
});

describe("ComponentDiscoveryService", () => {
  it("discovers stored browser sources, Codex targets, repos, and desktop windows", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    await store.saveSource({
      id: "src_1",
      kind: "browserTab",
      browser: "chrome",
      title: "ChatGPT - Notes",
      url: "https://chatgpt.com/",
      boundAt: now
    });
    await store.saveTarget({
      id: "target_1",
      kind: "codexDeepLink",
      repoPath: tempDir,
      openMode: "newThread",
      boundAt: now
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
          }
        ];
      }
    } as Pick<WindowsTargetService, "listTopLevelWindows"> as WindowsTargetService;

    const result = await new ComponentDiscoveryService(store, windows).discover();

    expect(result.components.some((component) => component.provider === "chatgpt")).toBe(true);
    expect(result.components.some((component) => component.provider === "codex")).toBe(true);
    expect(result.components.some((component) => component.kind === "repo")).toBe(true);
    expect(result.components.some((component) => component.provider === "terminal" && component.riskLevel === "high")).toBe(true);
  });
});
