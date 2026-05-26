import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { SetupService, resolveHelperPaths, type NativeHostRegistry } from "../src/services/setup-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-setup-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("SetupService", () => {
  it("reports missing native host setup before configuration", async () => {
    const service = new SetupService(new JsonFileStore(tempDir), new MemoryRegistry(), tempDir, tempDir);

    const status = await service.getStatus();

    expect(status.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "nativeHostManifest", status: "missing" })]));
  });

  it("generates and registers a native host manifest with the extension ID", async () => {
    const registry = new MemoryRegistry();
    const service = new SetupService(new JsonFileStore(tempDir), registry, tempDir, tempDir);

    const status = await service.configureNativeHost({ extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    const manifestPath = await registry.readManifestPath();
    const manifest = JSON.parse(await readFile(manifestPath ?? "", "utf8")) as { allowed_origins: string[] };

    expect(status.extensionId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(status.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "allowedOrigin", status: "ready" })]));
    expect(manifest.allowed_origins).toContain("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/");
  });

  it("resolves development helper paths from the repo root", () => {
    const paths = resolveHelperPaths({ repoRoot: "C:\\repo\\agentbridge", devServerUrl: "http://127.0.0.1:5173/" });

    expect(paths.mode).toBe("development");
    expect(paths.nativeHostScriptPath).toContain("apps\\native-host\\dist\\src\\index.js");
    expect(paths.winUiaHelperPath).toContain("apps\\win-uia-helper\\bin\\Debug");
    expect(paths.devServerUrl).toBe("http://127.0.0.1:5173/");
  });

  it("resolves packaged helper paths from Electron resources", () => {
    const paths = resolveHelperPaths({
      isPackaged: true,
      appPath: "C:\\Program Files\\AgentBridge\\resources\\app.asar",
      resourcesPath: "C:\\Program Files\\AgentBridge\\resources"
    });

    expect(paths.mode).toBe("packaged");
    expect(paths.nativeHostScriptPath).toBe("C:\\Program Files\\AgentBridge\\resources\\native-host\\native-host.mjs");
    expect(paths.winUiaHelperPath).toBe("C:\\Program Files\\AgentBridge\\resources\\win-uia-helper\\AgentBridge.WinUiaHelper.exe");
  });
});

class MemoryRegistry implements NativeHostRegistry {
  private manifestPath: string | undefined;

  async readManifestPath(): Promise<string | undefined> {
    return this.manifestPath;
  }

  async writeManifestPath(path: string): Promise<void> {
    this.manifestPath = path;
  }
}
