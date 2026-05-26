import { describe, expect, it } from "vitest";
import { ArtifactBundleSchema, ArtifactFileSchema, type ArtifactBundle, type ArtifactFile } from "../src/types.js";

const now = "2026-01-01T00:00:00.000Z";

describe("artifact file schemas", () => {
  it("parses artifact file metadata and bundles", () => {
    const file: ArtifactFile = {
      id: "file_1",
      artifactId: "artifact_1",
      missionId: "mission_1",
      fileName: "summary.txt",
      localPath: "C:/AgentBridge/artifacts/mission_1/file_1/summary.txt",
      relativePath: "summary.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      sha256: "abc123",
      classification: "document",
      createdAt: now
    };
    const bundle: ArtifactBundle = {
      id: "bundle_1",
      missionId: "mission_1",
      name: "Planner review input",
      artifactIds: ["artifact_1"],
      fileIds: [file.id],
      purpose: "reviewInput",
      createdAt: now
    };

    expect(ArtifactFileSchema.parse(file).classification).toBe("document");
    expect(ArtifactBundleSchema.parse(bundle).fileIds).toEqual(["file_1"]);
  });
});
