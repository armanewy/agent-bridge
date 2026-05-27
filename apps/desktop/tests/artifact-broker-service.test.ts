import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { ArtifactBrokerService } from "../src/services/artifact-broker-service.js";
import { PlatformService } from "../src/services/platform-service.js";

let tempDir: string;
let artifactRoot: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-artifact-broker-"));
  artifactRoot = join(tempDir, "artifacts");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("ArtifactBrokerService", () => {
  it("stores generated text files under the artifact root", async () => {
    const store = new JsonFileStore(tempDir);
    const broker = createBroker(store);

    const file = await broker.importGeneratedTextAsFile("mission_1", "notes.txt", "hello");

    expect(file.fileName).toBe("notes.txt");
    expect(file.sha256).toBe(broker.computeSha256("hello"));
    expect(file.localPath).toContain(artifactRoot);
    await expect(broker.getFileContent(file.id)).resolves.toEqual(Buffer.from("hello"));
    await expect(store.listArtifactsForMission("mission_1")).resolves.toEqual([
      expect.objectContaining({ kind: "fileReference" })
    ]);
  });

  it("imports local files and creates bundles", async () => {
    const sourcePath = join(tempDir, "source.diff");
    await writeFile(sourcePath, "diff --git a/file b/file", "utf8");
    const store = new JsonFileStore(tempDir);
    const broker = createBroker(store);

    const file = await broker.importLocalFile("mission_1", sourcePath);
    const bundle = await broker.createBundle("mission_1", "Review input", [file.artifactId], [file.id], "reviewInput");

    expect(file.classification).toBe("diff");
    expect(bundle.fileIds).toEqual([file.id]);
    await expect(store.listArtifactBundlesForMission("mission_1")).resolves.toEqual([bundle]);
  });

  it("stages artifact files under the staging root without mutating the repo", async () => {
    const store = new JsonFileStore(tempDir);
    const broker = createBroker(store);
    const file = await broker.importGeneratedTextAsFile("mission_1", "notes.txt", "stage me");

    const staged = await broker.stageFilesForMission("mission_1", [file.id], "executorInput");

    expect(staged).toHaveLength(1);
    expect(staged[0]?.relativePath).toContain(file.id);
    expect(staged[0]?.stagedPath).toContain(join(tempDir, "staging"));
    expect(await readFile(staged[0]?.stagedPath ?? "", "utf8")).toBe("stage me");
  });

  it("flags risky files before provider upload or repo import", async () => {
    const store = new JsonFileStore(tempDir);
    const broker = createBroker(store);
    const file = await broker.importGeneratedTextAsFile("mission_1", "secrets.txt", "SECRET_TOKEN=sk-secret-value");

    const findings = await broker.scanFileRisk(file.id, {
      allowedFileExtensions: [".md"],
      requireApprovalForBinaryFiles: true
    });

    expect(findings.map((finding) => finding.kind)).toEqual(expect.arrayContaining(["blockedExtension", "secret"]));
  });

  it("blocks path traversal when reading files", async () => {
    const store = new JsonFileStore(tempDir);
    const broker = createBroker(store);
    await store.saveArtifactFile({
      id: "file_escape",
      artifactId: "artifact_escape",
      missionId: "mission_1",
      fileName: "escape.txt",
      localPath: join(tempDir, "..", "escape.txt"),
      sizeBytes: 1,
      sha256: "x",
      classification: "unknown",
      createdAt: new Date().toISOString()
    });

    await expect(broker.getFileContent("file_escape")).rejects.toThrow("escapes");
  });
});

function createBroker(store: JsonFileStore): ArtifactBrokerService {
  return new ArtifactBrokerService(store, new PlatformService({ platform: "win32", userDataDir: tempDir }));
}
