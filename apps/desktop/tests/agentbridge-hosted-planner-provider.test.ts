import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { AuthService, MemoryAuthStorage } from "../src/services/auth-service.js";
import {
  AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
  AgentBridgeHostedPlannerProvider,
  FetchHostedPlannerTransport,
  type HostedPlannerTransport
} from "../src/services/providers/agentbridge-hosted-planner-provider.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-hosted-planner-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("AgentBridgeHostedPlannerProvider", () => {
  it("reports needsAuth when the desktop is signed out", async () => {
    const provider = new AgentBridgeHostedPlannerProvider(new JsonFileStore(tempDir), new AuthService(new MemoryAuthStorage()));

    const status = await provider.status();

    expect(status.id).toBe(AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID);
    expect(status.status).toBe("needsAuth");
    expect(status.authMode).toBe("agentBridgeCloud");
  });

  it("stores hosted planner turns and artifacts with mocked cloud responses", async () => {
    const store = new JsonFileStore(tempDir);
    const auth = new AuthService(new MemoryAuthStorage());
    await auth.signInDevMode();
    const provider = new AgentBridgeHostedPlannerProvider(store, auth, {
      transport: mockTransport(),
      now: fixedNow
    });

    const response = await provider.plan({
      missionId: "mission_1",
      prompt: "Simplify the Workbench UI.",
      contextArtifactIds: [],
      repoContext: {
        repoPath: "C:\\Users\\name\\secret-repo",
        repoName: "agent-bridge",
        currentBranch: "main"
      },
      metadata: {}
    });

    expect(response.providerId).toBe(AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID);
    expect(response.content).toContain("Hosted planner response");
    expect(response.artifactIds).toHaveLength(1);
    const sessions = await store.listAgentSessions(AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID);
    expect(sessions).toHaveLength(1);
    const turns = await store.listAgentTurns(sessions[0]?.id ?? "");
    expect(turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect((await store.listArtifactsForMission("mission_1")).map((artifact) => artifact.title)).toEqual([
      "Planner user message",
      "Hosted Planner payload summary",
      "Hosted Planner response"
    ]);
  });

  it("creates TaskSpec responses through the hosted task-spec endpoint", async () => {
    const store = new JsonFileStore(tempDir);
    const auth = new AuthService(new MemoryAuthStorage());
    await auth.signInDevMode();
    const provider = new AgentBridgeHostedPlannerProvider(store, auth, {
      transport: mockTransport(),
      now: fixedNow
    });

    const response = await provider.createTaskSpec({
      missionId: "mission_2",
      prompt: "Create a scoped task.",
      metadata: {}
    });

    expect(response.taskSpec).toMatchObject({ title: "Hosted TaskSpec" });
    expect(response.content).toContain("Hosted TaskSpec");
    expect((await store.listArtifactsForMission("mission_2")).map((artifact) => artifact.kind)).toEqual([
      "reviewNote",
      "reviewNote",
      "modelResponse"
    ]);
  });

  it("does not send repo paths or file ids by default", async () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    const store = new JsonFileStore(tempDir);
    const auth = new AuthService(new MemoryAuthStorage());
    await auth.signInDevMode();
    const provider = new AgentBridgeHostedPlannerProvider(store, auth, {
      transport: mockTransport(requests),
      now: fixedNow
    });

    await provider.plan({
      missionId: "mission_3",
      prompt: "Use repo context only as identity.",
      fileIds: ["file_should_not_send"],
      repoContext: {
        repoPath: "C:\\Users\\name\\very-secret-path",
        repoName: "agent-bridge",
        currentBranch: "main"
      },
      metadata: {}
    });

    const serialized = JSON.stringify(requests);
    expect(serialized).toContain("agent-bridge");
    expect(serialized).not.toContain("very-secret-path");
    expect(serialized).not.toContain("file_should_not_send");
  });

  it("stores payload summaries and blocks high-severity redaction findings before planner message calls", async () => {
    const requests: Array<{ path: string; body?: unknown }> = [];
    const store = new JsonFileStore(tempDir);
    const auth = new AuthService(new MemoryAuthStorage());
    await auth.signInDevMode();
    const provider = new AgentBridgeHostedPlannerProvider(store, auth, {
      transport: mockTransport(requests),
      now: fixedNow
    });

    await expect(provider.plan({
      missionId: "mission_4",
      prompt: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890",
      metadata: {}
    })).rejects.toThrow("high-severity");

    expect(requests.map((request) => request.path)).toEqual(["/v1/planner/sessions"]);
    const artifacts = await store.listArtifactsForMission("mission_4");
    expect(artifacts.map((artifact) => artifact.title)).toContain("Hosted Planner payload summary");
    expect(JSON.stringify(artifacts)).toContain("bearerToken");
  });

  it("includes cloud error body details in hosted transport failures", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "quota exceeded", requestId: "req_123" }), {
        status: 429,
        headers: { "content-type": "application/json" }
      })) as typeof fetch;

    try {
      const transport = new FetchHostedPlannerTransport();
      await expect(
        transport.request("/v1/planner/task-spec", {
          method: "POST",
          token: "token",
          baseUrl: "http://127.0.0.1:8787",
          body: { payload: { intent: "Plan." } }
        })
      ).rejects.toThrow("AgentBridge Cloud returned HTTP 429: quota exceeded (req_123)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function mockTransport(requests: Array<{ path: string; body?: unknown }> = []): HostedPlannerTransport {
  return {
    async request(path, input) {
      requests.push({ path, body: input.body });
      if (path === "/v1/planner/sessions") {
        return {
          sessionId: "cloud_session_1",
          createdAt: fixedNow(),
          metadata: { model: "mock" }
        } as never;
      }
      if (path === "/v1/planner/task-spec") {
        return {
          taskSpec: sampleTaskSpec(),
          requestId: "req_task",
          createdAt: fixedNow(),
          metadata: { model: "mock" }
        } as never;
      }
      if (path === "/v1/planner/review") {
        return {
          reviewSummary: "Hosted review.",
          statusSuggestion: "needs_review",
          requestId: "req_review",
          createdAt: fixedNow(),
          metadata: { model: "mock" }
        } as never;
      }
      return {
        sessionId: "cloud_session_1",
        turnId: "turn_1",
        content: "Hosted planner response.",
        requestId: "req_message",
        createdAt: fixedNow(),
        metadata: { model: "mock" }
      } as never;
    }
  };
}

function sampleTaskSpec() {
  return {
    title: "Hosted TaskSpec",
    goal: "Create a scoped hosted planner task.",
    background: "Mock hosted planner response.",
    instructions: ["Keep it small."],
    requirements: ["Store artifacts locally."],
    constraints: ["Do not upload repo files."],
    nonGoals: ["Do not add providers."],
    acceptanceCriteria: ["TaskSpec is valid."],
    suggestedFiles: [],
    verificationSteps: [],
    expectedSummaryFormat: "Summary, verification, risks."
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
