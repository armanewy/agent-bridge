import { describe, expect, it } from "vitest";
import {
  AgentProviderProfileSchema,
  ExecutorTaskRequestSchema,
  ProviderArtifactCapabilitiesSchema,
  type ProviderArtifactCapabilities,
  type TaskSpec
} from "../src/types.js";

const taskSpec: TaskSpec = {
  title: "Use artifacts",
  goal: "Route artifacts between providers.",
  background: "Artifact exchange should be explicit.",
  instructions: [],
  requirements: [],
  constraints: [],
  nonGoals: [],
  acceptanceCriteria: [],
  suggestedFiles: [],
  verificationSteps: [],
  expectedSummaryFormat: "Summary"
};

describe("provider artifact capabilities", () => {
  it("parses provider artifact capability metadata", () => {
    const capabilities: ProviderArtifactCapabilities = {
      canAcceptTextArtifacts: true,
      canAcceptFileInputs: true,
      canAcceptFilePaths: false,
      canReturnTextArtifacts: true,
      canReturnFileArtifacts: true,
      canReturnDiffs: false,
      canReturnLogs: false,
      canReturnScreenshots: false,
      maxInputFileBytes: 1024,
      acceptedMimeTypes: ["text/plain"]
    };

    expect(ProviderArtifactCapabilitiesSchema.parse(capabilities).canAcceptFileInputs).toBe(true);
    expect(
      AgentProviderProfileSchema.parse({
        id: "codex",
        kind: "executor",
        displayName: "Codex",
        capabilities: ["canExecuteCode"],
        authMode: "appServer",
        status: "unavailable",
        artifactCapabilities: capabilities,
        metadata: {}
      }).artifactCapabilities?.acceptedMimeTypes
    ).toEqual(["text/plain"]);
  });

  it("adds artifact refs to executor request schemas", () => {
    expect(
      ExecutorTaskRequestSchema.parse({
        missionId: "mission_1",
        taskSpec,
        artifactBundleIds: ["bundle_1"],
        fileIds: ["file_1"],
        stagedFilePaths: ["staging/file.txt"]
      }).stagedFilePaths
    ).toEqual(["staging/file.txt"]);
  });
});
