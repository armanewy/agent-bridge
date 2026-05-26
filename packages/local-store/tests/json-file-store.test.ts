import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  CodexThreadRef,
  DeliveryAttempt,
  Handoff,
  HandoffCard,
  Link,
  LinkableComponent,
  Mission,
  OpenAIUploadedFileRef,
  TaskSpec,
  UserDecision,
  VerificationResult,
  WorkflowLink
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

  it("saves and lists links", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const link: Link = {
      id: "link_1",
      name: "ChatGPT to Codex",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "implementationBrief",
      deliveryMode: "codexDeepLink",
      createdAt: now,
      updatedAt: now,
      enabled: true
    };

    await store.saveLink(link);

    expect(await store.getLink("link_1")).toEqual(link);
    expect(await store.listLinks()).toHaveLength(1);
  });

  it("roundtrips linkable components and workflow links", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const component: LinkableComponent = {
      id: "component_source_1",
      kind: "browserTab",
      label: "ChatGPT - AgentBridge",
      subtitle: "chatgpt.com",
      provider: "chatgpt",
      roleCapabilities: {
        canBeSource: true,
        canBeTarget: false,
        canBeWorkspace: false,
        canCapture: true,
        canDeliver: false,
        canVerify: false,
        canObserve: false
      },
      riskLevel: "low",
      status: "available",
      compatibilityScore: 90,
      backingRef: { sourceId: "src_1", tabId: 10 },
      metadata: { url: "https://chatgpt.com/" },
      discoveredAt: now,
      updatedAt: now
    };
    const workflowLink: WorkflowLink = {
      id: "workflow_1",
      name: "ChatGPT to Codex",
      sourceComponentId: component.id,
      workspaceComponentId: "component_repo_1",
      targetComponentId: "component_target_1",
      recipe: "implementationBrief",
      verificationCommandDefaults: [{ kind: "test", command: "pnpm test" }],
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    await store.saveLinkableComponent(component);
    await store.saveWorkflowLink(workflowLink);

    expect(await store.getLinkableComponent(component.id)).toEqual(component);
    expect(await store.listLinkableComponents()).toEqual([component]);
    expect(await store.getWorkflowLink(workflowLink.id)).toEqual(workflowLink);
    expect(await store.listWorkflowLinks()).toEqual([workflowLink]);
  });

  it("roundtrips Codex thread refs", async () => {
    const store = new JsonFileStore(tempDir);
    const ref: CodexThreadRef = {
      id: "codex_thread_1",
      threadId: "thread_123",
      name: "Existing task",
      repoPath: tempDir,
      status: "idle",
      source: "manual",
      lastSeenAt: new Date().toISOString(),
      metadata: {}
    };

    await store.saveCodexThreadRef(ref);

    expect(await store.getCodexThreadRef(ref.threadId)).toEqual(ref);
    expect(await store.listCodexThreadRefs(tempDir)).toEqual([ref]);
    expect(await store.listCodexThreadRefs("C:/other")).toEqual([]);
  });

  it("roundtrips ChatGPT desktop sources", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    await store.saveSource({
      id: "src_chatgpt_desktop_1",
      kind: "chatgptDesktop",
      provider: "chatgpt",
      appKind: "desktopApp",
      processId: 123,
      hwnd: "0x123",
      executablePath: "C:/Users/example/AppData/Local/Programs/ChatGPT/ChatGPT.exe",
      windowTitle: "ChatGPT",
      sessionTitle: "AgentBridge planning",
      fingerprint: "chatgpt_desktop_fingerprint",
      capabilities: {
        canReadSelectedText: true,
        canReadLatestMessage: true,
        canListSessions: false,
        canSendTurn: false
      },
      confidence: "medium",
      discoveredAt: now,
      updatedAt: now,
      boundAt: now
    });

    expect(await store.getSource("src_chatgpt_desktop_1")).toMatchObject({
      kind: "chatgptDesktop",
      sessionTitle: "AgentBridge planning"
    });
  });

  it("roundtrips extension heartbeat", async () => {
    const store = new JsonFileStore(tempDir);
    const heartbeat = {
      extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      extensionVersion: "0.1.0",
      receivedAt: new Date().toISOString(),
      messageType: "healthCheck" as const,
      permissionMode: "activeTab" as const,
      messageSource: "agentbridge-extension" as const
    };

    await store.saveExtensionHeartbeat(heartbeat);

    expect(await store.getExtensionHeartbeat()).toEqual(heartbeat);
  });

  it("roundtrips provider profiles, sessions, turns, and events", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const profile: AgentProviderProfile = {
      id: "openai-planner",
      kind: "planner",
      displayName: "OpenAI Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canSendMessage"],
      authMode: "apiKey",
      status: "needsAuth",
      metadata: { model: "gpt-4.1" }
    };
    const session: AgentSessionRef = {
      id: "session_1",
      providerId: profile.id,
      providerKind: "planner",
      externalSessionId: "response_conversation_1",
      title: "Workbench planning",
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {}
    };
    const turn: AgentTurn = {
      id: "turn_1",
      providerId: profile.id,
      sessionRefId: session.id,
      role: "user",
      content: "Plan the workbench.",
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

  it("saves handoffs and audit events", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const handoff: Handoff = {
      id: "handoff_1",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Send this",
      structured: {
        goal: "Send",
        context: "Send this",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };
    const event: AuditEvent = {
      id: "audit_1",
      type: "captureCreated",
      entityId: "cap_1",
      details: { captureType: "selectedText" },
      createdAt: now
    };

    await store.saveHandoff(handoff);
    await store.appendAuditEvent(event);

    expect(await store.getHandoff("handoff_1")).toEqual(handoff);
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
      strategy: "codexDeepLink",
      success: true,
      warnings: [],
      targetMetadata: { repoPath: tempDir },
      attemptedAt: new Date().toISOString()
    };

    await store.saveDeliveryAttempt(attempt);

    expect(await store.listDeliveryAttempts("handoff_1")).toEqual([attempt]);
  });

  it("loads a v1-shaped store without losing existing handoffs", async () => {
    const now = new Date().toISOString();
    const handoff: Handoff = {
      id: "handoff_legacy",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Legacy handoff",
      structured: {
        goal: "Relay",
        context: "Legacy handoff",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };
    await writeFile(
      join(tempDir, "agentbridge-store.json"),
      JSON.stringify({
        version: 1,
        links: {},
        sources: {},
        targets: {},
        captures: {},
        handoffs: { [handoff.id]: handoff },
        deliveryAttempts: {},
        approvals: {},
        auditEvents: [],
        settings: {}
      }),
      "utf8"
    );

    const store = new JsonFileStore(tempDir);

    expect(await store.getHandoff("handoff_legacy")).toEqual(handoff);
    expect(await store.listMissions()).toEqual([]);
  });

  it("loads a v4-shaped store with empty provider sections", async () => {
    const mission: Mission = {
      id: "mission_v4",
      title: "Existing mission",
      goal: "Remain readable after migration.",
      status: "draft",
      sourceIds: [],
      captureIds: [],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeFile(
      join(tempDir, "agentbridge-store.json"),
      JSON.stringify({
        version: 4,
        links: {},
        linkableComponents: {},
        workflowLinks: {},
        codexThreadRefs: {},
        sources: {},
        targets: {},
        captures: {},
        handoffs: {},
        deliveryAttempts: {},
        missions: { [mission.id]: mission },
        handoffCards: {},
        artifacts: {},
        runs: {},
        runSteps: {},
        verificationResults: {},
        approvals: {},
        auditEvents: [],
        settings: {}
      }),
      "utf8"
    );

    const store = new JsonFileStore(tempDir);

    expect(await store.getMission(mission.id)).toEqual(mission);
    expect(await store.listProviderProfiles()).toEqual([]);
    expect(await store.listAgentSessions()).toEqual([]);
    expect(await store.listAgentEvents()).toEqual([]);
    expect(await store.listAutopilotPolicies()).toEqual([]);
    expect(await store.listAutopilotRunsForMission(mission.id)).toEqual([]);
    expect(await store.listPendingUserDecisions()).toEqual([]);
    expect(await store.listArtifactFilesForMission(mission.id)).toEqual([]);
    expect(await store.listArtifactBundlesForMission(mission.id)).toEqual([]);
    expect(await store.listOpenAIUploadedFileRefs()).toEqual([]);
  });

  it("roundtrips mission, handoff card, and artifact", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const mission: Mission = {
      id: "mission_1",
      title: "Mission",
      goal: "Compile a task spec",
      status: "draft",
      sourceIds: ["src_1"],
      captureIds: ["cap_1"],
      handoffCardIds: ["card_1"],
      artifactIds: ["artifact_1"],
      runIds: [],
      createdAt: now,
      updatedAt: now
    };
    const card: HandoffCard = {
      id: "card_1",
      missionId: mission.id,
      sourceId: "src_1",
      captureId: "cap_1",
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

  it("roundtrips OpenAI uploaded file refs", async () => {
    const store = new JsonFileStore(tempDir);
    const ref: OpenAIUploadedFileRef = {
      localFileId: "file_1",
      openaiFileId: "file-openai-1",
      uploadedAt: new Date().toISOString(),
      purpose: "user_data",
      sha256: "abc123"
    };

    await store.saveOpenAIUploadedFileRef(ref);

    expect(await store.getOpenAIUploadedFileRef(ref.localFileId)).toEqual(ref);
    expect(await store.listOpenAIUploadedFileRefs()).toEqual([ref]);
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
  background: "Captured guidance",
  instructions: ["Create the task"],
  requirements: ["Persist it"],
  constraints: ["Keep existing APIs"],
  nonGoals: ["Provider expansion"],
  acceptanceCriteria: ["Tests pass"],
  suggestedFiles: [],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};
