import type {
  AgentBridgeApi,
  MissionDetail,
  VerificationRunRequest,
  VerificationRunResponse,
  CodexAppServerStatus,
  PlatformStatus,
  WindowRevalidation,
  AutopilotStatus
} from "../services/bridge-contract.js";
import type {
  CodexThreadRef,
  LinkableComponent,
  AuditEvent,
  Mission,
  RepoContextPack,
  TargetEndpoint,
  WindowsDesktopWindowTarget,
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  ExecutorTaskResult,
  HandoffCard,
  TaskSpec,
  WorkspaceCandidate
} from "@agentbridge/core";

const now = () => new Date().toISOString();
const scenarioTimestamp = "2026-05-27T12:00:00.000Z";
const mockRepoPath = "C:\\Users\\aoztu\\Documents\\Agent Bridge";

type MockScenarioName =
  | "default"
  | "empty"
  | "first-run"
  | "connected"
  | "mission-planned"
  | "verification-failed"
  | "autopilot-running"
  | "long-content";

let mockTargets: TargetEndpoint[] = [];
let mockCodexThreads: CodexThreadRef[] = [];
let mockComponents: LinkableComponent[] = [mockChatGptPlannerComponent()];
let mockAuditEvents: AuditEvent[] = [];
let mockMissions: Mission[] = [];
let mockMissionDetails = new Map<string, MissionDetail>();
let mockProviderProfiles: AgentProviderProfile[] = defaultMockProviderProfiles();
let mockAgentSessions: AgentSessionRef[] = [];
let mockAgentEvents: AgentEvent[] = [];
let mockAuthSignedIn = false;
let mockCloudBaseUrl = "http://127.0.0.1:8787";
let mockWorkspaceCandidates: WorkspaceCandidate[] = [];
let mockCodexAppServerStatus: CodexAppServerStatus = {
  configured: false,
  available: false,
  canSendIntoExistingThreads: false,
  message: "Codex App Server endpoint is not configured.",
  checkedAt: now()
};
let mockAutopilotStatuses = new Map<string, AutopilotStatus>();
let mockScenarioInitialized = false;
const mockPlatformStatus: PlatformStatus = {
  capabilities: {
    platform: "windows",
    canPackageDesktopApp: true,
    canRunShellCommands: true,
    canOpenExternalLinks: true,
    canUseCodexAppServer: true,
    canUseDesktopAutomation: true,
    canUseWindowsUia: true,
    canUseMacAccessibility: false,
    canUseAppleEvents: false,
    canUseGlobalShortcuts: true,
    canUseTray: true,
    canUseFilePicker: true,
    canUseUserSelectedRepoAccess: true
  },
  userDataDir: "mock://AgentBridge",
  artifactRoot: "mock://AgentBridge/artifacts",
  stagingRoot: "mock://AgentBridge/staging",
  logsDir: "mock://AgentBridge/logs",
  defaultShell: "cmd.exe"
};

function defaultMockProviderProfiles(): AgentProviderProfile[] {
  return [
    {
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canUseRepo", "canListSessions", "canCreateSession", "canResumeSession", "canSendMessage"],
      authMode: "appServer",
      status: "unavailable",
      metadata: { adapter: "mock", reason: "Codex provider wrapper is not active in renderer mock." }
    }
  ];
}

function initializeMockScenario(): void {
  if (mockScenarioInitialized) {
    return;
  }
  mockScenarioInitialized = true;

  const scenario = mockScenarioFromUrl();
  resetMockState({ includeDefaultPlanner: scenario === "default" });

  switch (scenario) {
    case "empty":
    case "first-run":
      return;
    case "connected":
      seedConnectedScenario();
      return;
    case "mission-planned":
      seedConnectedScenario();
      seedWorkbenchMission("planned");
      return;
    case "verification-failed":
      seedConnectedScenario();
      seedWorkbenchMission("verification-failed");
      return;
    case "autopilot-running":
      seedConnectedScenario();
      seedWorkbenchMission("autopilot-running");
      return;
    case "long-content":
      seedConnectedScenario({ longContent: true });
      seedWorkbenchMission("long-content");
      return;
    case "default":
      return;
  }
}

function mockScenarioFromUrl(): MockScenarioName {
  if (typeof window === "undefined") {
    return "default";
  }
  const value = new URLSearchParams(window.location.search).get("scenario");
  switch (value) {
    case "empty":
    case "first-run":
    case "connected":
    case "mission-planned":
    case "verification-failed":
    case "autopilot-running":
    case "long-content":
      return value;
    default:
      return "default";
  }
}

function resetMockState({ includeDefaultPlanner }: { includeDefaultPlanner: boolean }): void {
  mockTargets = [];
  mockCodexThreads = [];
  mockComponents = includeDefaultPlanner ? [mockChatGptPlannerComponent()] : [];
  mockAuditEvents = [];
  mockMissions = [];
  mockMissionDetails = new Map<string, MissionDetail>();
  mockProviderProfiles = defaultMockProviderProfiles();
  mockAgentSessions = [];
  mockAgentEvents = [];
  mockAuthSignedIn = false;
  mockCloudBaseUrl = "http://127.0.0.1:8787";
  mockWorkspaceCandidates = [];
  mockCodexAppServerStatus = {
    configured: false,
    available: false,
    canSendIntoExistingThreads: false,
    message: "Codex App Server endpoint is not configured.",
    checkedAt: scenarioTimestamp
  };
  mockAutopilotStatuses = new Map<string, AutopilotStatus>();
}

function seedConnectedScenario(options: { longContent?: boolean } = {}): void {
  const plannerComponent = mockChatGptPlannerComponent({
    title: options.longContent ? "ChatGPT - Long implementation brief" : "ChatGPT - AgentBridge UI iteration",
    url: "https://chatgpt.com/c/agentbridge-ui-testing",
    discoveredAt: scenarioTimestamp
  });
  const workspaceComponent = mockRepoComponent(createMockRepoContext(mockRepoPath), "scenario_agentbridge");

  mockComponents = mergeMockComponents([plannerComponent, workspaceComponent]);
  mockCodexThreads = [
    {
      id: "codex_thread_scenario",
      threadId: "thread_scenario_ui",
      name: "AgentBridge UI test thread",
      repoPath: mockRepoPath,
      status: "active",
      source: "appServer",
      lastSeenAt: scenarioTimestamp,
      metadata: { scenario: true }
    }
  ];
  mockAgentSessions = [
    {
      id: "agent_session_scenario_codex",
      providerId: "codex",
      providerKind: "executor",
      externalSessionId: "thread_scenario_ui",
      title: "AgentBridge UI test thread",
      repoPath: mockRepoPath,
      status: "active",
      createdAt: scenarioTimestamp,
      lastSeenAt: scenarioTimestamp,
      metadata: { integrationMode: "appServer" }
    }
  ];
  mockAuthSignedIn = true;
  mockProviderProfiles = mockProviderProfiles.map((profile) => {
    if (profile.id === "codex") {
      return { ...profile, status: "available", metadata: { ...profile.metadata, reason: "Scenario ready." } };
    }
    return profile;
  });
  mockCodexAppServerStatus = {
    configured: true,
    available: true,
    canSendIntoExistingThreads: true,
    message: "Scenario Codex App Server is available.",
    checkedAt: scenarioTimestamp
  };
}

function seedWorkbenchMission(scenario: "planned" | "verification-failed" | "autopilot-running" | "long-content"): void {
  const repoContext = createMockRepoContext(mockRepoPath);
  const missionId = `mission_scenario_${scenario}`;
  const taskSpec: TaskSpec = {
    ...mockTaskSpec(),
    title: scenario === "long-content" ? "Stress test long UI copy without layout overlap" : "Add browser-first UI tests",
    goal: "Make AgentBridge UI changes easy to verify before shipping.",
    background: scenario === "long-content" ? longScenarioText() : "The renderer should expose deterministic states for browser automation.",
    acceptanceCriteria: [
      "Renderer states can be opened directly by URL.",
      "Smoke tests cover connected, planned, verification, and long-content states."
    ],
    verificationSteps: ["pnpm ui:test", "pnpm build"]
  };
  const plannerArtifact = {
    id: "artifact_scenario_planner_response",
    missionId,
    kind: "modelResponse" as const,
    title: "Imported ChatGPT planner response",
    content: "Scenario ChatGPT plan with enough structure to generate a TaskSpec.",
    metadata: { scenario: true, providerId: "chatgpt-manual", source: "manualChatGptPlannerImport", imported: true },
    createdAt: scenarioTimestamp
  };
  const card = {
    ...mockHandoffCard(missionId, taskSpec),
    id: "card_scenario_task",
    inputArtifactId: "manual_planner_response",
    targetId: "provider:codex",
    taskSpec,
    repoContext,
    generatedPrompt: buildMockPrompt(taskSpec.background, "implementationBrief"),
    artifactIds: ["artifact_scenario_prompt"],
    createdAt: scenarioTimestamp,
    updatedAt: scenarioTimestamp
  };
  const promptArtifact = {
    id: "artifact_scenario_prompt",
    missionId,
    handoffCardId: card.id,
    kind: "generatedPrompt" as const,
    title: "Generated prompt",
    content: card.generatedPrompt,
    metadata: { scenario: true },
    createdAt: scenarioTimestamp
  };
  const verificationArtifact = {
    id: "artifact_scenario_verification",
    missionId,
    kind: "gitDiff" as const,
    title: "Git diff summary",
    content: "Mock verification found a UI regression in the smoke path.",
    metadata: { scenario: true },
    createdAt: scenarioTimestamp
  };
  const verificationRun = {
    id: "run_scenario_verification",
    missionId,
    status: "needs_review" as const,
    stepIds: [],
    artifactIds: [verificationArtifact.id],
    startedAt: scenarioTimestamp,
    completedAt: scenarioTimestamp,
    createdAt: scenarioTimestamp,
    updatedAt: scenarioTimestamp
  };
  const verificationResult = {
    id: "verification_scenario_failed",
    missionId,
    runId: verificationRun.id,
    status: "failed" as const,
    commandResults: [
      {
        kind: "test" as const,
        command: "pnpm ui:test",
        exitCode: 1,
        status: "failed" as const
      }
    ],
    summary: "Mock verification failed: a smoke test caught a UI regression.",
    artifactIds: [verificationArtifact.id],
    createdAt: scenarioTimestamp
  };
  const artifacts = scenario === "planned"
    ? [plannerArtifact]
    : [plannerArtifact, promptArtifact, ...(scenario === "verification-failed" ? [verificationArtifact] : [])];
  const mission: Mission = {
    id: missionId,
    title: taskSpec.title,
    goal: taskSpec.goal,
    status: scenario === "verification-failed" ? "needs_review" : scenario === "planned" ? "planned" : "ready",
    handoffCardIds: scenario === "planned" ? [] : [card.id],
    artifactIds: artifacts.map((artifact) => artifact.id),
    runIds: scenario === "verification-failed" ? [verificationRun.id] : [],
    repoContext,
    verificationPlan: {
      commands: [
        { kind: "test", command: "pnpm ui:test", cwd: repoContext.repoPath },
        { kind: "typecheck", command: "pnpm build", cwd: repoContext.repoPath }
      ],
      manualChecklist: ["Inspect desktop and mobile screenshots."],
      expectedArtifacts: ["TaskSpec", "verification summary"]
    },
    createdAt: scenarioTimestamp,
    updatedAt: scenarioTimestamp
  };

  mockMissions = [mission];
  mockMissionDetails.set(mission.id, {
    mission,
    handoffCards: scenario === "planned" ? [] : [card],
    artifacts,
    deliveryAttempts: [],
    runs: scenario === "verification-failed" ? [verificationRun] : [],
    verificationResults: scenario === "verification-failed" ? [verificationResult] : [],
    missionWorkspaces: [
      {
        id: "workspace_scenario",
        missionId,
        baseRepoPath: repoContext.repoPath,
        workingPath: repoContext.repoPath,
        strategy: "none",
        baseBranch: repoContext.currentBranch,
        branchName: repoContext.currentBranch,
        status: "active",
        createdAt: scenarioTimestamp,
        updatedAt: scenarioTimestamp
      }
    ]
  });

  if (scenario === "autopilot-running") {
    const status = mockAutopilotStatus(mission.id, "policy_supervised_default", "autopilot_run_scenario", "planning");
    mockAutopilotStatuses.set(mission.id, status);
  }
}

function longScenarioText(): string {
  return [
    "Refactor the AgentBridge desktop workbench so it can handle long task descriptions, nested planner output, and verbose verification summaries without overlapping controls or truncating the primary decision buttons.",
    "The test fixture should include unusually long repository paths, detailed acceptance criteria, multiple verification commands, and a dense explanation of why browser-first UI testing lets us iterate faster before packaging Electron.",
    "Keep the copy realistic: this is a power-user tool for routing intent into Codex, tracking evidence, and reviewing agent output."
  ].join(" ");
}

export function getAgentBridgeApi(): AgentBridgeApi {
  return window.agentBridge ?? createMockAgentBridgeApi();
}

function createMockAgentBridgeApi(): AgentBridgeApi {
  initializeMockScenario();
  return {
    async listTargets() {
      return mockTargets;
    },
    async listLinkableComponents() {
      return mockComponents;
    },
    async discoverLinkableComponents() {
      mockComponents = mergeMockComponents(mockComponents);
      return { components: mockComponents, warnings: [] };
    },
    async listCodexThreads(repoPath?: string) {
      return mockCodexThreads.filter((thread) => !repoPath || thread.repoPath === repoPath);
    },
    async listProviders() {
      return mockProviderProfiles;
    },
    async getProviderStatus(providerId: string) {
      return mockProviderProfiles.find((profile) => profile.id === providerId);
    },
    async createAgentSession(providerId, input = {}) {
      const profile = mockProviderProfiles.find((item) => item.id === providerId);
      if (!profile) {
        throw new Error(`Provider ${providerId} not found.`);
      }
      const session: AgentSessionRef = {
        id: `agent_session_${mockAgentSessions.length + 1}`,
        providerId,
        providerKind: profile.kind,
        externalSessionId: `mock_external_${mockAgentSessions.length + 1}`,
        ...(input.title ? { title: input.title } : {}),
        ...(input.repoPath ? { repoPath: input.repoPath } : {}),
        status: "active",
        createdAt: now(),
        lastSeenAt: now(),
        metadata: input.metadata ?? {}
      };
      mockAgentSessions = [session, ...mockAgentSessions];
      return session;
    },
    async resumeAgentSession(_providerId, sessionRefId) {
      const session = mockAgentSessions.find((item) => item.id === sessionRefId);
      if (!session) {
        throw new Error(`Agent session ${sessionRefId} not found.`);
      }
      const resumed: AgentSessionRef = { ...session, status: "active", lastSeenAt: now() };
      mockAgentSessions = mockAgentSessions.map((item) => (item.id === resumed.id ? resumed : item));
      return resumed;
    },
    async listAgentSessions(providerId?: string) {
      return mockAgentSessions.filter((session) => !providerId || session.providerId === providerId);
    },
    async getAgentBridgeAuthStatus() {
      return {
        status: mockAuthSignedIn ? "signedIn" : "signedOut",
        signedIn: mockAuthSignedIn,
        cloudBaseUrl: mockCloudBaseUrl,
        mode: "development",
        ...(mockAuthSignedIn ? { user: { id: "user_dev", email: "dev@agentbridge.local" } } : {})
      };
    },
    async signInAgentBridgeDevMode() {
      mockAuthSignedIn = true;
      return this.getAgentBridgeAuthStatus();
    },
    async signOutAgentBridge() {
      mockAuthSignedIn = false;
      return this.getAgentBridgeAuthStatus();
    },
    async getAgentBridgeCurrentUser() {
      return mockAuthSignedIn ? { id: "user_dev", email: "dev@agentbridge.local" } : undefined;
    },
    async setAgentBridgeCloudBaseUrl(url: string) {
      mockCloudBaseUrl = url.replace(/\/+$/, "");
      return this.getAgentBridgeAuthStatus();
    },
    async inferWorkspaceForMission(missionId: string) {
      const mission = mockMissions.find((item) => item.id === missionId);
      mockWorkspaceCandidates = [
        ...mockAgentSessions
          .filter((session) => session.repoPath)
          .map((session) => ({
            id: `workspace_candidate_${session.id}`,
            repoName: session.repoPath?.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? session.repoPath,
            repoPath: session.repoPath,
            source: "codexAppServerThread" as const,
            confidence: 95,
            evidence: [`Mock Codex App Server session ${session.externalSessionId}.`],
            requiresConfirmation: false,
            createdAt: now()
          })),
        ...(mission?.goal.includes("github.com")
          ? [{
              id: "workspace_candidate_github",
              repoName: "mock/github",
              remoteUrl: "https://github.com/mock/github",
              source: "githubUrl" as const,
              confidence: 80,
              evidence: ["Mock GitHub URL in mission."],
              requiresConfirmation: true,
              createdAt: now()
            }]
          : [])
      ];
      return mockWorkspaceCandidates;
    },
    async confirmWorkspaceCandidate(candidateId: string) {
      return mockWorkspaceCandidates.find((candidate) => candidate.id === candidateId);
    },
    async attachWorkspaceToMission(missionId, input) {
      const repoContext = {
        repoPath: input.repoPath,
        ...(input.repoName ? { repoName: input.repoName } : {}),
        ...(input.branch ? { currentBranch: input.branch } : {})
      };
      updateMockMission(missionId, { repoContext });
      const mission = mockMissions.find((item) => item.id === missionId) ?? mockMissionDetails.get(missionId)?.mission;
      if (!mission) {
        throw new Error("Mission not found.");
      }
      return mission;
    },
    async createWorkbenchMission(input = {}) {
      const plannerArtifact = input.importedPlannerResponse?.trim()
        ? {
            id: `artifact_planner_${Date.now()}`,
            missionId: `mission_${mockMissions.length + 1}`,
            kind: "modelResponse" as const,
            title: "Imported ChatGPT planner response",
            content: input.importedPlannerResponse.trim(),
            metadata: {
              providerId: "chatgpt-manual",
              source: "manualChatGptPlannerImport",
              imported: true
            },
            createdAt: now()
          }
        : undefined;
      const mission: Mission = {
        id: plannerArtifact?.missionId ?? `mission_${mockMissions.length + 1}`,
        title: input.title ?? "Workbench task",
        goal: input.goal ?? "Plan, execute, verify, and review an AI-agent task.",
        status: plannerArtifact ? "planned" : "draft",
        handoffCardIds: [],
        artifactIds: plannerArtifact ? [plannerArtifact.id] : [],
        runIds: [],
        ...(input.repoContext ? { repoContext: input.repoContext } : {}),
        verificationPlan: {
          commands: input.verificationCommands ?? [],
          manualChecklist: [],
          expectedArtifacts: ["taskSpec", "generatedPrompt", "verificationResult"]
        },
        createdAt: now(),
        updatedAt: now()
      };
      mockMissions = [mission, ...mockMissions];
      mockMissionDetails.set(mission.id, {
        mission,
        handoffCards: [],
        artifacts: plannerArtifact ? [plannerArtifact] : [],
        deliveryAttempts: [],
        runs: [],
        verificationResults: []
      });
      return mission;
    },
    async createTaskSpecFromLatestPlannerTurn(missionId) {
      const taskSpec = mockTaskSpec();
      const card = mockHandoffCard(missionId, taskSpec);
      updateMockMission(missionId, { status: "ready", handoffCardIds: [card.id] });
      const detail = mockMissionDetails.get(missionId);
      if (detail) {
        detail.handoffCards = [card, ...detail.handoffCards];
      }
      return card;
    },
    async sendTaskSpecToExecutor(missionId) {
      const result: ExecutorTaskResult = {
        id: `executor_result_${mockAgentEvents.length + 1}`,
        providerId: "codex",
        deliveryMode: "dryRun",
        success: true,
        warnings: [],
        artifactIds: [],
        createdAt: now(),
        metadata: { mock: true }
      };
      updateMockMission(missionId, { status: "delivered" });
      return result;
    },
    async runMissionWorkbenchVerification(missionId, input = {}) {
      return this.runVerification({ missionId, ...input });
    },
    async createFollowUpFromPlannerReview(missionId) {
      const card = mockHandoffCard(missionId, {
        ...mockTaskSpec(),
        title: "Follow-up task",
        goal: "Fix the verification follow-up."
      });
      const detail = mockMissionDetails.get(missionId);
      if (detail) {
        detail.handoffCards = [card, ...detail.handoffCards];
      }
      return card;
    },
    async sendFollowUpToExecutor(_missionId) {
      return {
        id: `executor_result_${mockAgentEvents.length + 1}`,
        providerId: "codex",
        deliveryMode: "dryRun",
        success: true,
        warnings: [],
        artifactIds: [],
        createdAt: now(),
        metadata: { mock: true, followUp: true }
      };
    },
    async startAutopilot(missionId, policyId) {
      const status = mockAutopilotStatus(missionId, policyId);
      mockAutopilotStatuses.set(missionId, status);
      return status;
    },
    async stopAutopilot(autopilotRunId) {
      const status = mockAutopilotStatus("mission_mock", undefined, autopilotRunId, "cancelled");
      mockAutopilotStatuses.set(status.run?.missionId ?? "mission_mock", status);
      return status;
    },
    async continueAutopilot(autopilotRunId) {
      const status = mockAutopilotStatus("mission_mock", undefined, autopilotRunId, "planning");
      mockAutopilotStatuses.set(status.run?.missionId ?? "mission_mock", status);
      return status;
    },
    async steerAutopilot(autopilotRunId, text) {
      const status = mockAutopilotStatus("mission_mock", undefined, autopilotRunId, "steering");
      status.steps.push({
        id: `autopilot_step_${status.steps.length + 1}`,
        autopilotRunId,
        missionId: "mission_mock",
        kind: "steer",
        status: "completed",
        inputArtifactIds: [],
        outputArtifactIds: [],
        startedAt: now(),
        completedAt: now(),
        metadata: { text }
      });
      mockAutopilotStatuses.set(status.run?.missionId ?? "mission_mock", status);
      return status;
    },
    async getAutopilotStatus(missionId) {
      return mockAutopilotStatuses.get(missionId) ?? { steps: [] };
    },
    async resolvePendingDecision(decisionId, selectedOption) {
      return {
        steps: [],
        run: {
          id: `autopilot_run_${decisionId}`,
          missionId: "mission_mock",
          policyId: "policy_mock",
          status: selectedOption === "Approve" ? "planning" : "cancelled",
          iteration: 0,
          maxIterations: 3,
          startedAt: now(),
          updatedAt: now()
        }
      };
    },
    async listMissions() {
      return mockMissions;
    },
    async getMissionDetail(id: string) {
      return mockMissionDetails.get(id);
    },
    async revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation> {
      return { status: "available", warnings: [], current: target };
    },
    async runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse> {
      const detail = mockMissionDetails.get(input.missionId);
      if (!detail) {
        throw new Error("Mission not found.");
      }
      const artifact = {
        id: `artifact_verification_${Date.now()}`,
        missionId: input.missionId,
        kind: "gitDiff" as const,
        title: "Git diff summary",
        content: "Mock verification saved a git diff summary.",
        metadata: {},
        createdAt: now()
      };
      const run = {
        id: `run_${Date.now()}`,
        missionId: input.missionId,
        status: "needs_review" as const,
        stepIds: [],
        artifactIds: [artifact.id],
        startedAt: now(),
        completedAt: now(),
        createdAt: now(),
        updatedAt: now()
      };
      const result = {
        id: `verification_${Date.now()}`,
        missionId: input.missionId,
        runId: run.id,
        status: "needs_review" as const,
        commandResults: [],
        summary: "Mock verification needs review.",
        artifactIds: [artifact.id],
        createdAt: now()
      };
      mockMissionDetails.set(input.missionId, {
        ...detail,
        mission: {
          ...detail.mission,
          status: "needs_review",
          runIds: [...detail.mission.runIds, run.id],
          artifactIds: [...detail.mission.artifactIds, artifact.id],
          updatedAt: now()
        },
        artifacts: [artifact, ...detail.artifacts],
        runs: [run, ...detail.runs],
        verificationResults: [result, ...detail.verificationResults]
      });
      mockMissions = mockMissions.map((mission) =>
        mission.id === input.missionId ? mockMissionDetails.get(input.missionId)?.mission ?? mission : mission
      );
      return { run, result, artifacts: [artifact] };
    },
    async getPlatformStatus(): Promise<PlatformStatus> {
      return mockPlatformStatus;
    },
    async getCodexAppServerStatus(): Promise<CodexAppServerStatus> {
      mockCodexAppServerStatus = { ...mockCodexAppServerStatus, checkedAt: now() };
      return mockCodexAppServerStatus;
    },
    async openEmbeddedChatGpt(input?: { url?: string }) {
      mockComponents = mergeMockComponents([
        mockChatGptPlannerComponent({
          title: input?.url?.trim() ? "Existing ChatGPT conversation" : "ChatGPT planner",
          url: input?.url?.trim() || "https://chatgpt.com/",
          discoveredAt: now()
        }),
        ...mockComponents
      ]);
      return undefined;
    },
    async importEmbeddedChatGptSelection() {
      return {
        text: "Mock ChatGPT structured plan for the selected mission.",
        title: "ChatGPT planner",
        url: "https://chatgpt.com/"
      };
    },
    async selectRepoFolder() {
      return "C:\\Users\\aoztu\\Documents\\Agent Bridge";
    },
    async openDataFolder() {
      return undefined;
    },
    async revealArtifactFile() {
      return undefined;
    },
    async clearLocalData() {
      resetMockState({ includeDefaultPlanner: true });
    },
    async listAuditEvents() {
      return mockAuditEvents;
    },
    async clearAuditEvents() {
      mockAuditEvents = [];
    }
  };
}

function mergeMockComponents(components: LinkableComponent[]): LinkableComponent[] {
  const byId = new Map<string, LinkableComponent>();
  for (const component of components) {
    byId.set(component.id, component);
  }
  return [...byId.values()];
}

function mockChatGptPlannerComponent(input: { title?: string; url?: string; discoveredAt?: string } = {}): LinkableComponent {
  const url = input.url ?? "https://chatgpt.com/";
  const discoveredAt = input.discoveredAt ?? now();
  return {
    id: "component_planner_chatgpt",
    kind: "desktopWindow",
    label: input.title ?? "ChatGPT planner",
    subtitle: new URL(url).hostname,
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
    metadata: { url, title: input.title ?? "ChatGPT planner" },
    discoveredAt,
    updatedAt: discoveredAt
  };
}

function mockRepoComponent(repoContext: RepoContextPack, idSuffix: string): LinkableComponent {
  return {
    id: `component_repo_${idSuffix}`,
    kind: "repo",
    label: repoContext.repoName ?? repoContext.repoPath,
    subtitle: `${repoContext.currentBranch ?? "branch unknown"} · ${repoContext.gitStatusSummary ?? "repo"}`,
    provider: "repo",
    roleCapabilities: {
      canBeTarget: false,
      canBeWorkspace: true,
      canDeliver: false,
      canVerify: true,
      canObserve: false
    },
    riskLevel: "low",
    status: "available",
    fitScore: 92,
    backingRef: { repoPath: repoContext.repoPath },
    metadata: repoContext,
    discoveredAt: now(),
    updatedAt: now()
  };
}

function updateMockMission(missionId: string, patch: Partial<Mission>): void {
  mockMissions = mockMissions.map((mission) =>
    mission.id === missionId
      ? {
          ...mission,
          ...patch,
          updatedAt: now()
        }
      : mission
  );
  const detail = mockMissionDetails.get(missionId);
  if (detail) {
    detail.mission = {
      ...detail.mission,
      ...patch,
      updatedAt: now()
    };
  }
}

function mockAutopilotStatus(
  missionId: string,
  policyId = "policy_mock",
  runId = `autopilot_run_${Date.now()}`,
  status: "idle" | "planning" | "executing" | "verifying" | "reviewing" | "steering" | "blocked" | "passed" | "failed" | "cancelled" = "planning"
): AutopilotStatus {
  return {
    run: {
      id: runId,
      missionId,
      policyId,
      status,
      iteration: 0,
      maxIterations: 3,
      startedAt: now(),
      updatedAt: now()
    },
    steps: [
      {
        id: `autopilot_step_${Date.now()}`,
        autopilotRunId: runId,
        missionId,
        kind: "plan" as const,
        status: "completed" as const,
        inputArtifactIds: [],
        outputArtifactIds: [],
        startedAt: now(),
        completedAt: now(),
        metadata: { title: "Mock autopilot step" }
      }
    ]
  };
}

function mockTaskSpec(): TaskSpec {
  return {
    title: "Mock Workbench Task",
    goal: "Send a scoped task to Codex.",
    background: "Renderer mock data keeps the UI interactive in browser dev mode.",
    instructions: ["Use the provider workbench flow."],
    requirements: ["Store task history."],
    constraints: ["Do not require external adapter setup."],
    nonGoals: ["Do not add generic RPA."],
    acceptanceCriteria: ["The task can be sent to Codex."],
    suggestedFiles: ["apps/desktop/src/components/workbench/WorkbenchPage.tsx"],
    verificationSteps: ["pnpm test"],
    expectedSummaryFormat: "Summary, verification, remaining risk"
  };
}

function mockHandoffCard(missionId: string, taskSpec: TaskSpec): HandoffCard {
  return {
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    missionId,
    inputArtifactId: "mock_planner_turn",
    targetId: "provider:codex",
    recipe: "implementationBrief",
    taskSpec,
    generatedPrompt: buildMockPrompt(taskSpec.background, "implementationBrief"),
    redactionFindings: [],
    deliveryAttemptIds: [],
    artifactIds: [],
    createdAt: now(),
    updatedAt: now()
  };
}

function createMockRepoContext(repoPath: string): RepoContextPack {
  const normalized = repoPath.replace(/\\/g, "/");
  return {
    repoPath,
    repoName: normalized.split("/").filter(Boolean).at(-1) ?? "repo",
    currentBranch: "main",
    gitStatusSummary: "Mock repo context; real Electron mode reads git status.",
    changedFiles: [],
    packageManager: "pnpm",
    testCommand: "pnpm test",
    typecheckCommand: "pnpm build"
  };
}

function buildMockPrompt(text: string, recipe: string): string {
  return [
    "Goal:",
    "Implement the requested AgentBridge workflow.",
    "",
    "Context:",
    text,
    "",
    "Acceptance criteria:",
    "- ChatGPT planner output is imported deliberately.",
    "- TaskSpec review is shown before delivery.",
    "- Codex delivery uses a deep link."
  ].join("\n");
}
