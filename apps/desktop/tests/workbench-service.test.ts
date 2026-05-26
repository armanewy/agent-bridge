import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  ExecutorProvider,
  ExecutorTaskRequest,
  ExecutorTaskResult
} from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { OpenAIPlannerProvider, type OpenAIPlannerTransport } from "../src/services/providers/openai-planner-provider.js";
import { WorkbenchService } from "../src/services/workbench-service.js";
import { VerificationService } from "../src/services/verification-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorkbenchService", () => {
  it("coordinates planner, task spec, executor, verification, and planner review", async () => {
    const store = new JsonFileStore(tempDir);
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport([JSON.stringify(sampleTaskSpec()), "Follow-up needed: inspect the failing edge case."]),
      now: fixedNow
    });
    const executor = new MockExecutorProvider();
    const verification = new VerificationService(store, async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 12
    }));
    const workbench = new WorkbenchService(store, planner, executor, verification, fixedNow);

    const mission = await workbench.createWorkbenchMission({
      repoContext: { repoPath: tempDir, testCommand: "pnpm test" },
      verificationCommands: [{ kind: "test", command: "pnpm test", cwd: tempDir }]
    });
    await workbench.sendUserMessageToPlanner(mission.id, "Plan a workbench simplification.");
    const card = await workbench.createTaskSpecFromLatestPlannerTurn(mission.id);
    const delivery = await workbench.sendTaskSpecToExecutor(mission.id);
    const verificationRun = await workbench.runMissionVerification(mission.id);
    const review = await workbench.sendVerificationToPlannerForReview(mission.id);

    expect(card.taskSpec.title).toBe("Provider workbench");
    expect(delivery.deliveryMode).toBe("newSession");
    expect(verificationRun.result.status).toBe("passed");
    expect(review.statusSuggestion).toBe("follow_up_needed");
    await expect(store.listArtifactsForMission(mission.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Planner response" }),
        expect.objectContaining({ title: "TaskSpec" }),
        expect.objectContaining({ title: "Executor delivery result" }),
        expect.objectContaining({ title: "Verification summary" })
      ])
    );
    await expect(store.listRunsForMission(mission.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ stepIds: expect.arrayContaining([expect.any(String)]) })
    ]));
  });
});

class MockExecutorProvider implements ExecutorProvider {
  profile(): AgentProviderProfile {
    return {
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canUseRepo", "canCreateSession", "canSendMessage"],
      authMode: "appServer",
      status: "available",
      metadata: { mock: true }
    };
  }

  async status(): Promise<AgentProviderProfile> {
    return this.profile();
  }

  async listSessions(): Promise<AgentSessionRef[]> {
    return [];
  }

  async createSession(): Promise<AgentSessionRef> {
    return {
      id: "codex_session_mock",
      providerId: "codex",
      providerKind: "executor",
      externalSessionId: "new_thread_mock",
      status: "active",
      lastSeenAt: fixedNow(),
      metadata: { openMode: "newThread" }
    };
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    return sessionRef;
  }

  async sendTask(input: ExecutorTaskRequest): Promise<ExecutorTaskResult> {
    return {
      id: "executor_result_mock",
      providerId: "codex",
      sessionRef: await this.createSession(),
      turnId: "turn_mock",
      deliveryMode: "newSession",
      success: true,
      warnings: [],
      artifactIds: [],
      createdAt: fixedNow(),
      metadata: { taskTitle: input.taskSpec.title }
    };
  }
}

function queuedTransport(outputs: string[]): OpenAIPlannerTransport {
  return {
    async createResponse() {
      const outputText = outputs.shift() ?? "Planner response.";
      return {
        responseId: `resp_${outputs.length}`,
        outputText,
        metadata: { transport: "mock" }
      };
    }
  };
}

function sampleTaskSpec() {
  return {
    title: "Provider workbench",
    goal: "Create one simple provider workbench flow.",
    background: "The app should default to Planner to Codex.",
    instructions: ["Ask planner", "Send to Codex"],
    requirements: ["Store artifacts"],
    constraints: ["Do not add providers"],
    nonGoals: ["No browser extension dependency"],
    acceptanceCriteria: ["Workbench flow can complete"],
    suggestedFiles: ["apps/desktop/src/services/workbench-service.ts"],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary and verification"
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
