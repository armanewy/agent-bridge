import { describe, expect, it } from "vitest";
import {
  AgentProviderProfileSchema,
  ExecutorTaskRequestSchema,
  PlannerRequestSchema,
  ProviderArtifactCapabilitiesSchema,
  ReviewRequestSchema,
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
        id: "openai-planner",
        kind: "planner",
        displayName: "OpenAI Planner",
        capabilities: ["canPlan"],
        authMode: "apiKey",
        status: "available",
        artifactCapabilities: capabilities,
        metadata: {}
      }).artifactCapabilities?.acceptedMimeTypes
    ).toEqual(["text/plain"]);
  });

  it("adds artifact refs to provider-neutral request schemas", () => {
    expect(PlannerRequestSchema.parse({ prompt: "Plan", artifactBundleIds: ["bundle_1"], fileIds: ["file_1"] }).fileIds).toEqual(["file_1"]);
    expect(
      ExecutorTaskRequestSchema.parse({
        missionId: "mission_1",
        taskSpec,
        artifactBundleIds: ["bundle_1"],
        fileIds: ["file_1"],
        stagedFilePaths: ["staging/file.txt"]
      }).stagedFilePaths
    ).toEqual(["staging/file.txt"]);
    expect(
      ReviewRequestSchema.parse({
        missionId: "mission_1",
        taskSpec,
        verificationResultIds: ["verification_1"],
        includeFileSummaries: true
      }).verificationResultIds
    ).toEqual(["verification_1"]);
  });
});
