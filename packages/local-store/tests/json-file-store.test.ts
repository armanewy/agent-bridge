import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore, defaultAgentBridgeDataDir } from "../src/index.js";
import type {
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  Artifact,
  ArtifactBundle,
  ArtifactFile,
  AutopilotPolicy,
  AutopilotRun,
  AutopilotStep,
  AuditEvent,
  CompletionContract,
  CompletionEvidence,
  CodexThreadRef,
  DeliveryAttempt,
  FileOwnership,
  HandoffCard,
  LinkableComponent,
  Mission,
  MissionQueueItem,
  MissionWorkspace,
  TaskSpec,
  UserDecision,
  VerificationResult,
  WorkflowTemplate
} from "@agentbridge/core";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-store-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("JsonFileStore", () => {
  it("uses a cross-platform data directory override", () => {
    const previous = process.env.AGENTBRIDGE_STORE_DIR;
    process.env.AGENTBRIDGE_STORE_DIR = tempDir;
    try {
      expect(defaultAgentBridgeDataDir()).toBe(tempDir);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENTBRIDGE_STORE_DIR;
      } else {
        process.env.AGENTBRIDGE_STORE_DIR = previous;
      }
    }
  });

  it("roundtrips linkable components", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const component: LinkableComponent = {
      id: "component_planner_1",
      kind: "desktopWindow",
      label: "ChatGPT planner",
      subtitle: "chatgpt.com",
      provider: "chatgpt",
      roleCapabilities: {
        canBeTarget: false,
        canBeWorkspace: false,
        canDeliver: false,
        canVerify: false,
        canObserve: false
      },
      riskLevel: "low",
      status: "available",
      fitScore: 90,
      backingRef: {},
      metadata: { url: "https://chatgpt.com/" },
      discoveredAt: now,
      updatedAt: now
    };

    await store.saveLinkableComponent(component);

    expect(await store.getLinkableComponent(component.id)).toEqual(component);
    expect(await store.listLinkableComponents()).toEqual([component]);
  });

  it("roundtrips workflow templates, completion contracts, workspaces, ownership, and queue items", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const template: WorkflowTemplate = {
      id: "workflow_default",
      name: "ChatGPT-style reasoning ↔ Codex coding",
      description: "Default provider workflow",
      roles: [
        {
          role: "planner",
          providerId: "chatgpt-manual",
          requiredCapabilities: [],
          optional: true,
          defaultSessionPolicy: "reuseOrCreate"
        },
        {
          role: "executor",
          providerId: "codex",
          requiredCapabilities: ["canExecuteCode"],
          optional: false,
          defaultSessionPolicy: "reuseOrCreate"
        }
      ],
      allowedTransitions: [
        {
          id: "transition_1",
          fromRole: "planner",
          toRole: "executor",
          transform: "taskSpecToExecutor",
          requiresApproval: false,
          producesArtifactKinds: ["generatedPrompt"]
        }
      ],
      defaultPolicy: {},
      createdAt: now,
      updatedAt: now
    };
    const contract: CompletionContract = {
      id: "contract_1",
      missionId: "mission_1",
      goal: "Make Workbench compact.",
      scope: ["Workbench UI"],
      nonGoals: [],
      acceptanceCriteria: [
        {
          id: "criterion_1",
          statement: "The app fits at 760x940.",
          evidenceRequired: "Screenshot or textual layout evidence.",
          verifierKind: "visual",
          required: true
        }
      ],
      verificationMethods: [
        {
          id: "method_1",
          kind: "visual",
          description: "Inspect screenshot at 760x940."
        }
      ],
      stopConditions: [],
      humanReviewTriggers: [],
      status: "valid",
      createdAt: now,
      updatedAt: now
    };
    const evidence: CompletionEvidence = {
      id: "evidence_1",
      contractId: contract.id,
      criterionId: "criterion_1",
      kind: "visual",
      status: "missing",
      summary: "No screenshot yet.",
      createdAt: now
    };
    const workspace: MissionWorkspace = {
      id: "workspace_1",
      missionId: contract.missionId,
      baseRepoPath: tempDir,
      workingPath: join(tempDir, ".agentbridge-worktree"),
      strategy: "gitWorktree",
      branchName: "agentbridge/mission-1",
      worktreeName: ".agentbridge-mission-1",
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    const ownership: FileOwnership = {
      id: "ownership_1",
      missionId: contract.missionId,
      workspaceId: workspace.id,
      relativePath: "apps/desktop/src/App.tsx",
      status: "changed",
      firstSeenAt: now,
      updatedAt: now
    };
    const queueItem: MissionQueueItem = {
      id: "queue_1",
      missionId: contract.missionId,
      priority: 10,
      status: "queued",
      assignedWorkspaceId: workspace.id,
      createdAt: now,
      updatedAt: now
    };

    await store.saveWorkflowTemplate(template);
    await store.saveCompletionContract(contract);
    await store.saveCompletionEvidence(evidence);
    await store.saveMissionWorkspace(workspace);
    await store.saveFileOwnership(ownership);
    await store.saveMissionQueueItem(queueItem);

    expect(await store.getWorkflowTemplate(template.id)).toEqual(template);
    expect(await store.listWorkflowTemplates()).toEqual([template]);
    expect(await store.getCompletionContract(contract.id)).toEqual(contract);
    expect(await store.listCompletionContractsForMission(contract.missionId)).toEqual([contract]);
    expect(await store.listCompletionEvidenceForContract(contract.id)).toEqual([evidence]);
    expect(await store.getMissionWorkspace(workspace.id)).toEqual(workspace);
    expect(await store.listMissionWorkspaces(contract.missionId)).toEqual([workspace]);
    expect(await store.listFileOwnershipForMission(contract.missionId)).toEqual([ownership]);
    expect(await store.listFileOwnershipByPath("apps\\desktop\\src\\App.tsx")).toEqual([ownership]);
    expect(await store.getMissionQueueItem(queueItem.id)).toEqual(queueItem);
    expect(await store.listMissionQueueItems()).toEqual([queueItem]);
    expect(await store.deleteWorkflowTemplate(template.id)).toBe(true);
    expect(await store.listWorkflowTemplates()).toEqual([]);
  });

  it("roundtrips Codex thread refs", async () => {
    const store = new JsonFileStore(tempDir);
    const ref: CodexThreadRef = {
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Existing task",
      repoPath: tempDir,
      status: "idle",
      source: "appServer",
      lastSeenAt: new Date().toISOString(),
      metadata: {}
    };

    await store.saveCodexThreadRef(ref);

    expect(await store.getCodexThreadRef(ref.threadId)).toEqual(ref);
    expect(await store.listCodexThreadRefs(tempDir)).toEqual([ref]);
    expect(await store.listCodexThreadRefs("C:/other")).toEqual([]);
  });

  it("roundtrips provider profiles, sessions, turns, and events", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const profile: AgentProviderProfile = {
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canCreateSession", "canSendMessage"],
      authMode: "appServer",
      status: "available",
      metadata: {}
    };
    const session: AgentSessionRef = {
      id: "session_1",
      providerId: profile.id,
      providerKind: "executor",
      externalSessionId: "thread_1",
      title: "Workbench execution",
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {}
    };
    const turn: AgentTurn = {
      id: "turn_1",
      providerId: profile.id,
      sessionRefId: session.id,
      role: "assistant",
      content: "Implemented the workbench task.",
      status: "completed",
      artifactIds: ["artifact_1"],
      createdAt: now,
      completedAt: now,
      metadata: {}
    };
    const event: AgentEvent = {
      id: "event_1",
      providerId: profile.id,
      sessionRefId: session.id,
      turnId: turn.id,
      type: "turn.completed",
      payload: { ok: true },
      createdAt: now
    };

    await store.saveProviderProfile(profile);
    await store.saveAgentSession(session);
    await store.saveAgentTurn(turn);
    await store.appendAgentEvent(event);

    expect(await store.getProviderProfile(profile.id)).toEqual(profile);
    expect(await store.listProviderProfiles()).toEqual([profile]);
    expect(await store.getAgentSession(session.id)).toEqual(session);
    expect(await store.listAgentSessions(profile.id)).toEqual([session]);
    expect(await store.getAgentTurn(turn.id)).toEqual(turn);
    expect(await store.listAgentTurns(session.id)).toEqual([turn]);
    expect(await store.listAgentEvents({ providerId: profile.id })).toEqual([event]);
    expect(await store.listAgentEvents({ sessionRefId: session.id, type: "turn.completed" })).toEqual([event]);
  });

  it("roundtrips autopilot policy, run, steps, and user decisions", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const policy: AutopilotPolicy = {
      id: "policy_1",
      name: "Supervised",
      mode: "supervised",
      maxIterations: 3,
      allowPlannerTurnsWithoutApproval: true,
      allowCodexTurnsWithoutApproval: false,
      allowVerificationWithoutApproval: true,
      allowShellCommands: "configuredOnly",
      allowFileWrites: "repoOnly",
      allowNetworkAccess: false,
      stopOnVerificationFailure: false,
      stopOnRedactionFinding: true,
      stopOnProviderWarning: true,
      createdAt: now,
      updatedAt: now
    };
    const run: AutopilotRun = {
      id: "autopilot_run_1",
      missionId: "mission_1",
      policyId: policy.id,
      status: "planning",
      iteration: 0,
      maxIterations: 3,
      startedAt: now,
      updatedAt: now
    };
    const step: AutopilotStep = {
      id: "autopilot_step_1",
      autopilotRunId: run.id,
      missionId: run.missionId,
      kind: "plan",
      status: "running",
      inputArtifactIds: [],
      outputArtifactIds: [],
      startedAt: now,
      metadata: {}
    };
    const decision: UserDecision = {
      id: "decision_1",
      missionId: run.missionId,
      autopilotRunId: run.id,
      decisionType: "approveCommand",
      prompt: "Run pnpm test?",
      options: ["Approve", "Stop"],
      status: "pending",
      createdAt: now
    };

    await store.saveAutopilotPolicy(policy);
    await store.saveAutopilotRun(run);
    await store.appendAutopilotStep(step);
    await store.saveUserDecision(decision);

    expect(await store.getAutopilotPolicy(policy.id)).toEqual(policy);
    expect(await store.listAutopilotPolicies()).toEqual([policy]);
    expect(await store.getAutopilotRun(run.id)).toEqual(run);
    expect(await store.listAutopilotRunsForMission(run.missionId)).toEqual([run]);
    expect(await store.listAutopilotSteps(run.id)).toEqual([step]);
    expect(await store.listPendingUserDecisions(run.missionId)).toEqual([decision]);

    const updatedRun = await store.updateAutopilotRunStatus(run.id, "blocked", { pendingUserDecisionId: decision.id });
    expect(updatedRun).toMatchObject({ status: "blocked", pendingUserDecisionId: decision.id });
    const resolvedDecision = await store.resolveUserDecision(decision.id, "Approve");
    expect(resolvedDecision).toMatchObject({ status: "resolved", selectedOption: "Approve" });
    expect(await store.listPendingUserDecisions()).toEqual([]);
  });

  it("saves audit events", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const event: AuditEvent = {
      id: "audit_1",
      type: "targetBound",
      entityId: "task_spec_1",
      details: { source: "chatgpt-plan" },
      createdAt: now
    };

    await store.appendAuditEvent(event);

    expect(await store.listAuditEvents()).toEqual([event]);
  });

  it("stores settings locally", async () => {
    const store = new JsonFileStore(tempDir);

    await store.saveSetting("theme", "system");

    expect(await store.getSetting("theme")).toBe("system");
  });

  it("stores delivery attempts", async () => {
    const store = new JsonFileStore(tempDir);
    const attempt: DeliveryAttempt = {
      id: "delivery_1",
      handoffId: "handoff_1",
      targetId: "target_1",
      strategy: "codexAppServerTurnStart",
      success: true,
      warnings: [],
      targetMetadata: { repoPath: tempDir },
      attemptedAt: new Date().toISOString()
    };

    await store.saveDeliveryAttempt(attempt);

    expect(await store.listDeliveryAttempts("handoff_1")).toEqual([attempt]);
  });

  it("roundtrips mission, handoff card, and artifact", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const mission: Mission = {
      id: "mission_1",
      title: "Mission",
      goal: "Compile a task spec",
      status: "draft",
      handoffCardIds: ["card_1"],
      artifactIds: ["artifact_1"],
      runIds: [],
      createdAt: now,
      updatedAt: now
    };
    const card: HandoffCard = {
      id: "card_1",
      missionId: mission.id,
      inputArtifactId: "artifact_1",
      targetId: "target_1",
      recipe: "implementationBrief",
      taskSpec,
      generatedPrompt: "Goal:\nCompile a task spec.",
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: ["artifact_1"],
      createdAt: now,
      updatedAt: now
    };
    const artifact: Artifact = {
      id: "artifact_1",
      missionId: mission.id,
      handoffCardId: card.id,
      kind: "generatedPrompt",
      title: "Generated prompt",
      content: card.generatedPrompt,
      metadata: {},
      createdAt: now
    };

    await store.saveMission(mission);
    await store.saveHandoffCard(card);
    await store.saveArtifact(artifact);

    expect(await store.getMission(mission.id)).toEqual(mission);
    expect(await store.listHandoffCardsForMission(mission.id)).toEqual([card]);
    expect(await store.listArtifactsForHandoffCard(card.id)).toEqual([artifact]);
  });

  it("roundtrips artifact files and bundles", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const file: ArtifactFile = {
      id: "file_1",
      artifactId: "artifact_1",
      missionId: "mission_1",
      fileName: "output.log",
      localPath: join(tempDir, "artifacts", "mission_1", "file_1", "output.log"),
      mimeType: "text/plain",
      sizeBytes: 12,
      sha256: "abc123",
      classification: "log",
      createdAt: now
    };
    const bundle: ArtifactBundle = {
      id: "bundle_1",
      missionId: file.missionId,
      name: "Verification input",
      artifactIds: [file.artifactId],
      fileIds: [file.id],
      purpose: "verificationInput",
      createdAt: now
    };

    await store.saveArtifactFile(file);
    await store.saveArtifactBundle(bundle);

    expect(await store.getArtifactFile(file.id)).toEqual(file);
    expect(await store.listArtifactFilesForMission(file.missionId)).toEqual([file]);
    expect(await store.getArtifactBundle(bundle.id)).toEqual(bundle);
    expect(await store.listArtifactBundlesForMission(file.missionId)).toEqual([bundle]);
  });

  it("roundtrips verification results", async () => {
    const store = new JsonFileStore(tempDir);
    const result: VerificationResult = {
      id: "verification_1",
      missionId: "mission_1",
      status: "needs_review",
      commandResults: [],
      summary: "No commands configured.",
      artifactIds: [],
      createdAt: new Date().toISOString()
    };

    await store.saveVerificationResult(result);

    expect(await store.listVerificationResultsForMission("mission_1")).toEqual([result]);
  });
});

const taskSpec: TaskSpec = {
  title: "Compile task",
  goal: "Create a durable task card.",
  background: "Imported guidance",
  instructions: ["Create the task"],
  requirements: ["Persist it"],
  constraints: ["Keep existing APIs"],
  nonGoals: ["Provider expansion"],
  acceptanceCriteria: ["Tests pass"],
  suggestedFiles: [],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};
