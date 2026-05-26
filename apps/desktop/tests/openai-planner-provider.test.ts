import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import {
  OPENAI_PLANNER_PROVIDER_ID,
  OpenAIPlannerProvider,
  type OpenAIPlannerTransport
} from "../src/services/providers/openai-planner-provider.js";
import type { TaskSpec } from "@agentbridge/core";

let tempDir: string;
let oldOpenAiKey: string | undefined;
let oldAgentBridgeOpenAiKey: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-openai-planner-"));
  oldOpenAiKey = process.env.OPENAI_API_KEY;
  oldAgentBridgeOpenAiKey = process.env.AGENTBRIDGE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AGENTBRIDGE_OPENAI_API_KEY;
});

afterEach(async () => {
  if (oldOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = oldOpenAiKey;
  }
  if (oldAgentBridgeOpenAiKey === undefined) {
    delete process.env.AGENTBRIDGE_OPENAI_API_KEY;
  } else {
    process.env.AGENTBRIDGE_OPENAI_API_KEY = oldAgentBridgeOpenAiKey;
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe("OpenAIPlannerProvider", () => {
  it("reports needsAuth when no API key or transport is configured", async () => {
    const provider = new OpenAIPlannerProvider(new JsonFileStore(tempDir));

    expect((await provider.status()).status).toBe("needsAuth");
    expect(provider.profile().metadata.apiKeySource).toBe("missing");
  });

  it("stores planner turns and artifacts with a mocked response", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = new OpenAIPlannerProvider(store, {
      transport: mockTransport("Implement the route builder and verify with tests."),
      now: fixedNow
    });

    const response = await provider.plan({
      missionId: "mission_1",
      prompt: "How should we simplify this workflow?",
      contextArtifactIds: [],
      repoContext: {
        repoPath: "C:\\repo\\agentbridge",
        currentBranch: "main",
        testCommand: "pnpm test"
      },
      metadata: {}
    });

    expect(response.providerId).toBe(OPENAI_PLANNER_PROVIDER_ID);
    expect(response.content).toContain("Implement the route builder");
    expect(response.artifactIds).toHaveLength(1);
    const sessions = await store.listAgentSessions(OPENAI_PLANNER_PROVIDER_ID);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.metadata.previousResponseId).toBe("resp_mock");
    const turns = await store.listAgentTurns(sessions[0]?.id ?? "");
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    const artifacts = await store.listArtifactsForMission("mission_1");
    expect(artifacts.map((artifact) => artifact.title)).toEqual(["Planner user message", "Planner response"]);
  });

  it("creates a review result through the planner provider", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = new OpenAIPlannerProvider(store, {
      transport: mockTransport("Follow-up needed: fix the failing test only."),
      now: fixedNow
    });

    const result = await provider.review({
      missionId: "mission_2",
      taskSpec: sampleTaskSpec(),
      verificationSummary: "pnpm test failed in route-builder.test.ts",
      artifactIds: [],
      metadata: {}
    });

    expect(result.statusSuggestion).toBe("follow_up_needed");
    expect(result.content).toContain("Follow-up needed");
    expect((await store.listArtifactsForMission("mission_2")).map((artifact) => artifact.kind)).toEqual([
      "reviewNote",
      "modelResponse"
    ]);
  });

  it("does not persist raw API keys to the local JSON store", async () => {
    const secret = "sk-test-secret-should-not-be-stored";
    const store = new JsonFileStore(tempDir);
    const provider = new OpenAIPlannerProvider(store, {
      apiKey: secret,
      transport: mockTransport("Planner response without secrets."),
      now: fixedNow
    });

    await provider.plan({
      missionId: "mission_3",
      prompt: "Create a task.",
      contextArtifactIds: [],
      metadata: {}
    });
    await store.saveProviderProfile(await provider.status());

    const raw = await readFile(join(tempDir, "agentbridge-store.json"), "utf8");
    expect(raw).not.toContain(secret);
  });
});

function mockTransport(outputText: string): OpenAIPlannerTransport {
  return {
    async createResponse() {
      return {
        responseId: "resp_mock",
        outputText,
        metadata: { transport: "mock" }
      };
    }
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}

function sampleTaskSpec(): TaskSpec {
  return {
    title: "Simplify workbench",
    goal: "Make the workbench flow obvious.",
    background: "The current screen exposes too many setup concepts.",
    instructions: ["Use one Planner to Codex flow."],
    requirements: ["Show delivery mode explicitly."],
    constraints: ["Do not add providers."],
    nonGoals: ["Do not build generic RPA."],
    acceptanceCriteria: ["Task can be sent to Codex."],
    suggestedFiles: ["apps/desktop/src/components/workbench/WorkbenchPage.tsx"],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Short engineering summary"
  };
}
