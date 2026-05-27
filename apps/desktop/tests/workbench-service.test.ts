import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  CodexThreadRef,
  ExecutorProvider,
  ExecutorTaskRequest,
  ExecutorTaskResult,
  PlannerProvider,
  PlannerRequest,
  PlannerResponse,
  ReviewRequest,
  ReviewResult
} from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { OpenAIPlannerProvider, type OpenAIPlannerTransport } from "../src/services/providers/openai-planner-provider.js";
import type { OpenAIPlannerResponseRequest } from "../src/services/providers/openai-planner-provider.js";
import { ActivePlannerProvider, ProviderRegistryService } from "../src/services/provider-registry-service.js";
import { WorkbenchService } from "../src/services/workbench-service.js";
import { VerificationService } from "../src/services/verification-service.js";
import { WorkspaceResolverService } from "../src/services/workspace-resolver-service.js";
import { CompletionContractService } from "../src/services/completion-contract-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("WorkbenchService", () => {
  it("starts planner work without a repo", async () => {
    const store = new JsonFileStore(tempDir);
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport(["Planner can start without workspace."], []),
      now: fixedNow
    });
    const workbench = new WorkbenchService(
      store,
      planner,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 })),
      fixedNow
    );

    const mission = await workbench.createWorkbenchMission({ goal: "Plan the no-repo bridge flow." });
    const response = await workbench.sendUserMessageToPlanner(mission.id, "Plan this first.");

    expect(mission.repoContext).toBeUndefined();
    expect(response.content).toContain("Planner can start");
  });

  it("uses the currently selected planner mode through the active planner adapter", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);
    registry.registerProvider(new MockPlannerProvider("agentbridge-hosted-planner", "Hosted planner response."));
    registry.registerProvider(new MockPlannerProvider("codex-local-planner", "Codex local planner response."));
    await registry.setPlannerMode("codexLocalPlanner");
    const workbench = new WorkbenchService(
      store,
      new ActivePlannerProvider(registry),
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 })),
      fixedNow
    );

    const mission = await workbench.createWorkbenchMission({ goal: "Use selected planner." });
    const response = await workbench.sendUserMessageToPlanner(mission.id, "Plan this first.");

    expect(response.providerId).toBe("codex-local-planner");
    expect(response.content).toContain("Codex local planner");
  });

  it("attaches a high-confidence Codex workspace candidate", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveCodexThreadRef(codexThreadRef(tempDir));
    await store.saveSetting(`repoContext:${tempDir}`, {
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      typecheckCommand: "pnpm build"
    });
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport(["Planner response."], []),
      now: fixedNow
    });
    const workbench = new WorkbenchService(
      store,
      planner,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 })),
      fixedNow,
      new WorkspaceResolverService(store, fixedNow)
    );

    const mission = await workbench.createWorkbenchMission({ goal: "Use the inferred workspace." });

    expect(mission.repoContext).toMatchObject({
      repoPath: tempDir,
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      typecheckCommand: "pnpm build"
    });
  });

  it("asks for a workspace only when verification needs one", async () => {
    const store = new JsonFileStore(tempDir);
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport(["Planner response."], []),
      now: fixedNow
    });
    const workbench = new WorkbenchService(
      store,
      planner,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 0 })),
      fixedNow
    );

    const mission = await workbench.createWorkbenchMission({ goal: "Verify later." });

    await expect(workbench.runMissionVerification(mission.id)).rejects.toThrow("Choose workspace to run verification.");
  });

  it("asks for a workspace before creating a new Codex thread", async () => {
    const store = new JsonFileStore(tempDir);
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport([JSON.stringify(sampleTaskSpec())], []),
      now: fixedNow
    });
    const workbench = new WorkbenchService(
      store,
      planner,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 0 })),
      fixedNow
    );
    const mission = await workbench.createWorkbenchMission({ goal: "Create a Codex task later." });

    await workbench.sendUserMessageToPlanner(mission.id, "Plan a task.");
    await workbench.createTaskSpecFromLatestPlannerTurn(mission.id);

    await expect(workbench.sendTaskSpecToExecutor(mission.id)).rejects.toThrow("Choose workspace to create a new Codex thread.");
  });

  it("coordinates planner, task spec, executor, verification, and planner review", async () => {
    const store = new JsonFileStore(tempDir);
    const plannerRequests: OpenAIPlannerResponseRequest[] = [];
    const planner = new OpenAIPlannerProvider(store, {
      transport: queuedTransport([JSON.stringify(sampleTaskSpec()), "Follow-up needed: inspect the failing edge case."], plannerRequests),
      now: fixedNow
    });
    const executor = new MockExecutorProvider();
    const verification = new VerificationService(store, async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 12
    }));
    const workbench = new WorkbenchService(
      store,
      planner,
      executor,
      verification,
      fixedNow,
      undefined,
      new CompletionContractService(store)
    );

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
    await expect(store.listCompletionContractsForMission(mission.id)).resolves.toEqual([
      expect.objectContaining({
        goal: "Create one simple provider workbench flow.",
        status: "valid"
      })
    ]);
    expect(delivery.deliveryMode).toBe("newSession");
    expect(verificationRun.result.status).toBe("passed");
    expect(review.statusSuggestion).toBe("follow_up_needed");
    expect(plannerRequests[1]?.input).toContain("Changed files summary:");
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

class MockPlannerProvider implements PlannerProvider {
  constructor(private readonly id: string, private readonly response: string) {}

  profile(): AgentProviderProfile {
    return {
      id: this.id,
      kind: "planner",
      displayName: this.id,
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "none",
      status: "available",
      metadata: {}
    };
  }

  async status(): Promise<AgentProviderProfile> {
    return this.profile();
  }

  async createSession(): Promise<AgentSessionRef> {
    return {
      id: `session_${this.id}`,
      providerId: this.id,
      providerKind: "planner",
      externalSessionId: `external_${this.id}`,
      status: "active",
      lastSeenAt: fixedNow(),
      metadata: {}
    };
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    return sessionRef;
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string): Promise<AgentTurn> {
    return {
      id: `turn_${this.id}`,
      providerId: this.id,
      sessionRefId: sessionRef.id,
      role: "assistant",
      content: message,
      status: "completed",
      artifactIds: [],
      createdAt: fixedNow(),
      completedAt: fixedNow(),
      metadata: {}
    };
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    return {
      providerId: this.id,
      content: this.response,
      artifactIds: [],
      createdAt: fixedNow(),
      metadata: { missionId: input.missionId }
    };
  }

  async review(_input: ReviewRequest): Promise<ReviewResult> {
    return {
      providerId: this.id,
      content: this.response,
      statusSuggestion: "needs_review",
      artifactIds: [],
      createdAt: fixedNow(),
      metadata: {}
    };
  }
}

function queuedTransport(outputs: string[], requests: OpenAIPlannerResponseRequest[]): OpenAIPlannerTransport {
  return {
    async createResponse(request) {
      requests.push(request);
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
    acceptanceCriteria: ["pnpm test passes for the Workbench flow"],
    suggestedFiles: ["apps/desktop/src/services/workbench-service.ts"],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary and verification"
  };
}

function codexThreadRef(repoPath: string): CodexThreadRef {
  return {
    id: "codex_thread_repo",
    threadId: "thread_repo",
    name: "Repo task",
    repoPath,
    status: "idle",
    source: "appServer",
    lastSeenAt: fixedNow(),
    metadata: {}
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
