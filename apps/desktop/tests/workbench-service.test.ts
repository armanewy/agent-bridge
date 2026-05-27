import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  CodexThreadRef,
  ExecutorProvider,
  ExecutorTaskRequest,
  ExecutorTaskResult
} from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
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
  it("imports a ChatGPT plan without calling a remote planner", async () => {
    const store = new JsonFileStore(tempDir);
    const workbench = new WorkbenchService(
      store,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 0 })),
      fixedNow,
      undefined,
      new CompletionContractService(store)
    );

    const mission = await workbench.createWorkbenchMission({
      goal: "Use ChatGPT as the planner.",
      importedPlannerResponse: [
        "Title: Provider workbench",
        "Goal: Create one simple provider workbench flow.",
        "Background: The app should use ChatGPT planning handoff and Codex execution.",
        "Instructions:",
        "- Parse the selected ChatGPT plan.",
        "- Send the generated task to Codex.",
        "Requirements:",
        "- Store artifacts.",
        "Constraints:",
        "- Do not add providers.",
        "Non-goals:",
        "- No browser extension dependency.",
        "Acceptance criteria:",
        "- pnpm test passes for the Workbench flow.",
        "Suggested files:",
        "- apps/desktop/src/services/workbench-service.ts",
        "Verification steps:",
        "- pnpm test",
        "Expected summary format: Summary and verification."
      ].join("\n")
    });
    const card = await workbench.createTaskSpecFromLatestPlannerTurn(mission.id);

    expect(card.taskSpec.title).toBe("Provider workbench");
    await expect(store.listArtifactsForMission(mission.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Imported ChatGPT planner response",
          metadata: expect.objectContaining({ source: "manualChatGptPlannerImport" })
        }),
        expect.objectContaining({ title: "TaskSpec" })
      ])
    );
  });

  it("attaches a high-confidence Codex workspace candidate", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveCodexThreadRef(codexThreadRef(tempDir));
    await store.saveSetting(`repoContext:${tempDir}`, {
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      typecheckCommand: "pnpm build"
    });
    const workbench = new WorkbenchService(
      store,
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
    const workbench = new WorkbenchService(
      store,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 0 })),
      fixedNow
    );

    const mission = await workbench.createWorkbenchMission({ goal: "Verify later." });

    await expect(workbench.runMissionVerification(mission.id)).rejects.toThrow("Choose workspace to run verification.");
  });

  it("asks for a workspace before creating a new Codex thread", async () => {
    const store = new JsonFileStore(tempDir);
    const workbench = new WorkbenchService(
      store,
      new MockExecutorProvider(),
      new VerificationService(store, async () => ({ exitCode: 0, stdout: "ok", stderr: "", durationMs: 0 })),
      fixedNow
    );
    const mission = await workbench.createWorkbenchMission({
      goal: "Create a Codex task later.",
      importedPlannerResponse: JSON.stringify(sampleTaskSpec())
    });

    await workbench.createTaskSpecFromLatestPlannerTurn(mission.id);

    await expect(workbench.sendTaskSpecToExecutor(mission.id)).rejects.toThrow("Choose workspace to create a new Codex thread.");
  });

  it("coordinates ChatGPT plan, task spec, executor, and verification", async () => {
    const store = new JsonFileStore(tempDir);
    const executor = new MockExecutorProvider();
    const verification = new VerificationService(store, async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 12
    }));
    const workbench = new WorkbenchService(
      store,
      executor,
      verification,
      fixedNow,
      undefined,
      new CompletionContractService(store)
    );

    const mission = await workbench.createWorkbenchMission({
      repoContext: { repoPath: tempDir, testCommand: "pnpm test" },
      verificationCommands: [{ kind: "test", command: "pnpm test", cwd: tempDir }],
      importedPlannerResponse: JSON.stringify(sampleTaskSpec())
    });
    const card = await workbench.createTaskSpecFromLatestPlannerTurn(mission.id);
    const delivery = await workbench.sendTaskSpecToExecutor(mission.id);
    const verificationRun = await workbench.runMissionVerification(mission.id);

    expect(card.taskSpec.title).toBe("Provider workbench");
    await expect(store.listCompletionContractsForMission(mission.id)).resolves.toEqual([
      expect.objectContaining({
        goal: "Create one simple provider workbench flow.",
        status: "valid"
      })
    ]);
    expect(delivery.deliveryMode).toBe("newSession");
    expect(verificationRun.result.status).toBe("passed");
    await expect(store.listArtifactsForMission(mission.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Imported ChatGPT planner response" }),
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
