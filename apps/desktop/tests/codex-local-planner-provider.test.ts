import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { CodexAppServerClient, type CodexAppServerTransport } from "../src/services/codex-app-server-client.js";
import { CodexLocalPlannerProvider } from "../src/services/providers/codex-local-planner-provider.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-codex-local-planner-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CodexLocalPlannerProvider", () => {
  it("reports available when Codex App Server responds", async () => {
    const provider = new CodexLocalPlannerProvider(new JsonFileStore(tempDir), client());

    await expect(provider.status()).resolves.toMatchObject({ status: "available" });
  });

  it("creates a planner thread turn and stores the response artifact", async () => {
    const store = new JsonFileStore(tempDir);
    const provider = new CodexLocalPlannerProvider(store, client({
      outputText: JSON.stringify(taskSpec())
    }));

    const response = await provider.createTaskSpec({
      missionId: "mission_1",
      prompt: "Plan a compact Workbench.",
      contextArtifactIds: [],
      metadata: {}
    });

    expect(response.taskSpec?.title).toBe("Compact Workbench");
    expect(response.artifactIds).toHaveLength(1);
    await expect(store.listArtifactsForMission("mission_1")).resolves.toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ providerId: "codex-local-planner" }) })
    ]);
  });
});

function client(turnMetadata: Record<string, unknown> = {}): CodexAppServerClient {
  const transport: CodexAppServerTransport = {
    async request(method) {
      if (method === "thread/loaded/list") {
        return [{ threadId: "thread_planner", name: "Planner", cwd: tempDir }];
      }
      if (method === "turn/start") {
        return { turnId: "turn_1", ...turnMetadata };
      }
      if (method === "thread/resume") {
        return {};
      }
      return {};
    }
  };
  return new CodexAppServerClient({ transport });
}

function taskSpec() {
  return {
    title: "Compact Workbench",
    goal: "Make Workbench compact.",
    background: "Desktop utility",
    instructions: ["Simplify"],
    requirements: ["No horizontal scroll"],
    constraints: ["Keep Simple Mode"],
    nonGoals: ["New providers"],
    acceptanceCriteria: ["pnpm test passes"],
    suggestedFiles: [],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary, tests, risks."
  };
}
