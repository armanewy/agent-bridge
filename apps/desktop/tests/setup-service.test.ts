import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { SetupService, type NativeHostRegistry } from "../src/services/setup-service.js";

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
