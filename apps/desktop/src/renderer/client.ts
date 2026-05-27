import type {
  AgentBridgeApi,
  CodexDeliveryRequest,
  CodexDeliveryResult,
  ConfigureNativeHostRequest,
  DeliveryPreview,
  HandoffCardDeliveryRequest,
  MissionDetail,
  PreviewRequest,
  VerificationRunRequest,
  VerificationRunResponse,
  SetupStatus,
  CodexAppServerStatus,
  PlatformStatus,
  WindowRevalidation,
  AutopilotStatus
} from "../services/bridge-contract.js";
import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  CodexThreadRef,
  Link,
  LinkableComponent,
  AuditEvent,
  Mission,
  RepoContextPack,
  SourceEndpoint,
  TargetEndpoint,
  WorkflowLink,
  WindowsDesktopWindowTarget,
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  ExecutorTaskResult,
  HandoffCard,
  TaskSpec,
  WorkspaceCandidate
} from "@agentbridge/core";

const now = () => new Date().toISOString();
const scenarioTimestamp = "2026-05-27T12:00:00.000Z";

type MockScenarioName =
  | "default"
  | "empty"
  | "first-run"
  | "connected"
  | "mission-planned"
  | "verification-failed"
  | "autopilot-running"
  | "long-content";

const mockSource: BrowserTabSource = {
  id: "src_mock_browser",
  kind: "browserTab",
  browser: "chrome",
  title: "ChatGPT - AgentBridge notes",
  url: "https://chatgpt.com/",
  boundAt: now()
};

const mockCapture: Capture = {
  id: "cap_mock_selection",
  sourceId: mockSource.id,
  captureType: "selectedText",
  text: "Build the AgentBridge MVP flow: capture selected browser text, transform it into an implementation brief, preview it, then send it to Codex with a codex:// deep link.",
  metadata: { mode: "mock" },
  createdAt: now(),
  userTriggered: true
};

let mockSources: SourceEndpoint[] = [mockSource];
let mockTargets: TargetEndpoint[] = [];
let mockLinks: Link[] = [];
let mockWorkflowLinks: WorkflowLink[] = [];
let mockCodexThreads: CodexThreadRef[] = [];
let mockComponents: LinkableComponent[] = [mockBrowserTabComponent(mockSource)];
let mockCaptures: Capture[] = [mockCapture];
let mockAuditEvents: AuditEvent[] = [];
let mockMissions: Mission[] = [];
let mockMissionDetails = new Map<string, MissionDetail>();
let mockProviderProfiles: AgentProviderProfile[] = defaultMockProviderProfiles();
let mockAgentSessions: AgentSessionRef[] = [];
let mockAgentTurns: AgentTurn[] = [];
let mockAgentEvents: AgentEvent[] = [];
let mockAuthSignedIn = false;
let mockCloudBaseUrl = "http://127.0.0.1:8787";
let mockWorkspaceCandidates: WorkspaceCandidate[] = [];
let mockExtensionId = "";
let mockExtensionConnected = false;
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
    canUseCodexDeepLinks: true,
    canUseCodexAppServer: true,
    canUseChromeNativeMessaging: true,
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
  resetMockState({ includeDefaultCapture: scenario === "default" });

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

function resetMockState({ includeDefaultCapture }: { includeDefaultCapture: boolean }): void {
  mockSources = includeDefaultCapture ? [mockSource] : [];
  mockTargets = [];
  mockLinks = [];
  mockWorkflowLinks = [];
  mockCodexThreads = [];
  mockComponents = includeDefaultCapture ? [mockBrowserTabComponent(mockSource)] : [];
  mockCaptures = includeDefaultCapture ? [mockCapture] : [];
  mockAuditEvents = [];
  mockMissions = [];
  mockMissionDetails = new Map<string, MissionDetail>();
  mockProviderProfiles = defaultMockProviderProfiles();
  mockAgentSessions = [];
  mockAgentTurns = [];
  mockAgentEvents = [];
  mockAuthSignedIn = false;
  mockCloudBaseUrl = "http://127.0.0.1:8787";
  mockWorkspaceCandidates = [];
  mockExtensionId = "";
  mockExtensionConnected = false;
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
  const source: BrowserTabSource = {
    id: "src_scenario_chatgpt",
    kind: "browserTab",
    browser: "agentbridge",
    title: options.longContent ? "ChatGPT - Long implementation brief" : "ChatGPT - AgentBridge UI iteration",
    url: "https://chatgpt.com/c/agentbridge-ui-testing",
    boundAt: scenarioTimestamp
  };
  const capture: Capture = {
    id: "cap_scenario_selection",
    sourceId: source.id,
    captureType: "selectedText",
    text: options.longContent ? longScenarioText() : "Make AgentBridge UI iteration fast: add deterministic mock states, browser smoke tests, and screenshots for the workbench flow.",
    metadata: { mode: "embeddedBrowser", scenario: true },
    createdAt: scenarioTimestamp,
    userTriggered: true
  };
  const target: CodexDeepLinkTarget = {
    id: "target_codex_agentbridge",
    kind: "codexDeepLink",
    repoPath: "C:\\Users\\aoztu\\Documents\\Agent Bridge",
    openMode: "newThread",
    boundAt: scenarioTimestamp
  };
  const sourceComponent = mockBrowserTabComponent(source);
  const targetComponent = mockTargetComponent(target);
  const workspaceComponent = mockRepoComponent(createMockRepoContext(target.repoPath), `scenario_${target.id}`);

  mockSources = [source];
  mockCaptures = [capture];
  mockTargets = [target];
  mockComponents = mergeMockComponents([sourceComponent, targetComponent, workspaceComponent]);
  mockWorkflowLinks = [
    {
      id: "workflow_scenario_chatgpt_to_codex",
      name: "ChatGPT to AgentBridge repo",
      sourceComponentId: sourceComponent.id,
      workspaceComponentId: workspaceComponent.id,
      targetComponentId: targetComponent.id,
      recipe: "implementationBrief",
      verificationCommandDefaults: [
        { kind: "test", command: "pnpm test" },
        { kind: "typecheck", command: "pnpm build" }
      ],
      codexOpenMode: "newThread",
      codexIntegrationMode: "appServer",
      enabled: true,
      createdAt: scenarioTimestamp,
      updatedAt: scenarioTimestamp
    }
  ];
  mockCodexThreads = [
    {
      id: "codex_thread_scenario",
      threadId: "thread_scenario_ui",
      name: "AgentBridge UI test thread",
      repoPath: target.repoPath,
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
      repoPath: target.repoPath,
      status: "active",
      createdAt: scenarioTimestamp,
      lastSeenAt: scenarioTimestamp,
      metadata: { integrationMode: "appServer" }
    }
  ];
  mockExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  mockExtensionConnected = true;
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
  const target = mockTargets.find((item): item is CodexDeepLinkTarget => item.kind === "codexDeepLink");
  const capture = mockCaptures[0];
  const repoContext = createMockRepoContext(target?.repoPath ?? "C:\\Users\\aoztu\\Documents\\Agent Bridge");
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
    sourceId: capture?.sourceId ?? "provider:chatgpt-manual",
    captureId: capture?.id ?? "mock_planner_turn",
    targetId: target?.id ?? "target_codex_agentbridge",
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
    sourceIds: ["provider:chatgpt-manual"],
    captureIds: capture ? [capture.id] : [],
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
    captures: capture ? [capture] : [],
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
    async listSources() {
      return mockSources;
    },
    async listTargets() {
      return mockTargets;
    },
    async listLinks() {
      return mockLinks;
    },
    async listLinkableComponents() {
      return mockComponents;
    },
    async discoverLinkableComponents() {
      mockComponents = mergeMockComponents([
        ...mockComponents,
        ...mockSources.filter((source): source is BrowserTabSource => source.kind === "browserTab").map((source) => mockBrowserTabComponent(source)),
        ...mockTargets.flatMap((target) => {
          const components = [mockTargetComponent(target)];
          if (target.kind === "codexDeepLink") {
            components.push(mockRepoComponent(createMockRepoContext(target.repoPath), `mock_${target.id}`));
          }
          return components;
        })
      ]);
      return { components: mockComponents, warnings: [] };
    },
    async listWorkflowLinks() {
      return mockWorkflowLinks;
    },
    async listCodexThreads(repoPath?: string) {
      return mockCodexThreads.filter((thread) => !repoPath || thread.repoPath === repoPath);
    },
    async saveManualCodexThreadRef(input) {
      const ref: CodexThreadRef = {
        id: `codex_thread_${mockCodexThreads.length + 1}`,
        threadId: input.threadId.trim(),
        ...(input.name ? { name: input.name } : {}),
        ...(input.repoPath ? { repoPath: input.repoPath } : {}),
        status: "unknown",
        source: "manual",
        lastSeenAt: now(),
        metadata: {}
      };
      mockCodexThreads = [ref, ...mockCodexThreads.filter((thread) => thread.threadId !== ref.threadId)];
      return ref;
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
    async sendProviderMessage(providerId, sessionRefId, message, context) {
      const turn: AgentTurn = {
        id: `agent_turn_${mockAgentTurns.length + 1}`,
        providerId,
        sessionRefId,
        role: "assistant",
        content: `Mock response to: ${message}`,
        status: "completed",
        artifactIds: [],
        createdAt: now(),
        completedAt: now(),
        metadata: context?.metadata ?? {}
      };
      mockAgentTurns = [...mockAgentTurns, turn];
      return turn;
    },
    async listAgentSessions(providerId?: string) {
      return mockAgentSessions.filter((session) => !providerId || session.providerId === providerId);
    },
    async listAgentTurns(sessionRefId: string) {
      return mockAgentTurns.filter((turn) => turn.sessionRefId === sessionRefId);
    },
    async listAgentEvents(filter = {}) {
      return mockAgentEvents
        .filter((event) => !filter.providerId || event.providerId === filter.providerId)
        .filter((event) => !filter.sessionRefId || event.sessionRefId === filter.sessionRefId)
        .filter((event) => !filter.turnId || event.turnId === filter.turnId)
        .filter((event) => !filter.type || event.type === filter.type);
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
        ...mockTargets
          .filter((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink")
          .map((target) => ({
            id: `workspace_candidate_${target.id}`,
            repoName: target.repoPath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? target.repoPath,
            repoPath: target.repoPath,
            source: "codexDeepLinkTarget" as const,
            confidence: 95,
            evidence: [`Mock Codex target ${target.id}.`],
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
        sourceIds: ["provider:chatgpt-manual"],
        captureIds: [],
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
        captures: [],
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
        id: `executor_result_${mockAgentTurns.length + 1}`,
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
        id: `executor_result_${mockAgentTurns.length + 1}`,
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
    async createWorkflowLink(input) {
      const link: WorkflowLink = {
        id: `workflow_${mockWorkflowLinks.length + 1}`,
        ...input,
        verificationCommandDefaults: input.verificationCommandDefaults ?? [],
        enabled: true,
        createdAt: now(),
        updatedAt: now()
      };
      mockWorkflowLinks = [link, ...mockWorkflowLinks];
      return link;
    },
    async createTaskFromWorkflowLink(input) {
      const link = mockWorkflowLinks.find((item) => item.id === input.workflowLinkId);
      if (!link) {
        throw new Error("Workflow link not found.");
      }
      const sourceComponent = mockComponents.find((item) => item.id === link.sourceComponentId);
      const targetComponent = mockComponents.find((item) => item.id === link.targetComponentId);
      const capture = mockCaptures.find((item) => item.sourceId === sourceComponent?.backingRef.sourceId);
      const targetId = targetComponent?.backingRef.targetId;
      if (!capture || !targetId) {
        throw new Error("Capture selected text first before creating a Task Card from this link.");
      }
      return this.previewHandoff({
        captureId: capture.id,
        targetId,
        recipe: link.recipe,
        ...(link.codexThreadId ? { codexThreadId: link.codexThreadId } : {}),
        ...(link.codexThreadName ? { codexThreadName: link.codexThreadName } : {}),
        ...(link.codexOpenMode ? { codexOpenMode: link.codexOpenMode } : {}),
        ...(link.codexIntegrationMode ? { codexIntegrationMode: link.codexIntegrationMode } : {})
      });
    },
    async listCaptures() {
      return mockCaptures;
    },
    async listMissions() {
      return mockMissions;
    },
    async getMissionDetail(id: string) {
      return mockMissionDetails.get(id);
    },
    async bindMockBrowserSource() {
      mockSources = [mockSource];
      mockCaptures = [mockCapture];
      mockComponents = mergeMockComponents([...mockComponents, mockBrowserTabComponent(mockSource)]);
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "sourceBound",
          entityId: mockSource.id,
          details: { mode: "mock" },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return mockSource;
    },
    async createLink(input) {
      const link: Link = {
        id: `link_${mockLinks.length + 1}`,
        ...input,
        createdAt: now(),
        updatedAt: now(),
        enabled: true
      };
      mockLinks = [link, ...mockLinks];
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "targetBound",
          entityId: link.targetId,
          details: { linkId: link.id },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return link;
    },
    async previewHandoff(input: PreviewRequest): Promise<DeliveryPreview> {
      const capture = mockCaptures.find((item) => item.id === input.captureId) ?? mockCapture;
      const target = mockTargets.find((item) => item.id === input.targetId);
      const repoContext = target?.kind === "codexDeepLink" ? createMockRepoContext(target.repoPath) : undefined;
      const prompt = buildMockPrompt(capture.text, input.recipe);
      const mission = {
        id: "mission_mock",
        title: "Build AgentBridge MVP flow",
        goal: "Compile a browser capture into a Codex-ready task.",
        status: "draft" as const,
        sourceIds: [capture.sourceId],
        captureIds: [capture.id],
        handoffCardIds: ["card_mock"],
        artifactIds: ["artifact_prompt_mock"],
        runIds: [],
        ...(repoContext ? { repoContext } : {}),
        createdAt: now(),
        updatedAt: now()
      };
      const taskSpec = {
        title: "Build AgentBridge MVP flow",
        goal: "Compile a browser capture into a Codex-ready task.",
        background: capture.text,
        instructions: ["Inspect the repository before editing.", "Preserve existing patterns."],
        requirements: ["Keep capture user-triggered.", "Show approval preview before delivery."],
        constraints: ["Do not broaden scope.", "Do not add providers."],
        nonGoals: ["No autonomous routing."],
        acceptanceCriteria: ["Codex receives the approved generated prompt."],
        suggestedFiles: [],
        verificationSteps: ["Run relevant tests."],
        expectedSummaryFormat: "Summary, verification, risks."
      };
      const handoffCard = {
        id: "card_mock",
        missionId: mission.id,
        sourceId: capture.sourceId,
        captureId: capture.id,
        targetId: input.targetId,
        recipe: input.recipe,
        taskSpec,
        generatedPrompt: prompt,
        ...(repoContext ? { repoContext } : {}),
        redactionFindings: [],
        deliveryAttemptIds: [],
        artifactIds: ["artifact_prompt_mock"],
        ...(input.codexThreadId ? { codexThreadId: input.codexThreadId } : {}),
        ...(input.codexThreadName ? { codexThreadName: input.codexThreadName } : {}),
        ...(input.codexOpenMode ? { codexDeliveryMode: input.codexOpenMode } : {}),
        ...(input.codexIntegrationMode ? { codexIntegrationMode: input.codexIntegrationMode } : {}),
        createdAt: now(),
        updatedAt: now()
      };
      const artifacts = [
        {
          id: "artifact_prompt_mock",
          missionId: mission.id,
          handoffCardId: handoffCard.id,
          kind: "generatedPrompt" as const,
          title: "Generated prompt",
          content: prompt,
          metadata: {},
          createdAt: now()
        }
      ];
      mockMissions = [mission, ...mockMissions.filter((item) => item.id !== mission.id)];
      mockMissionDetails.set(mission.id, {
        mission,
        handoffCards: [handoffCard],
        captures: [capture],
        artifacts,
        deliveryAttempts: [],
        runs: [],
        verificationResults: []
      });
      const source = mockSources.find((item) => item.id === capture.sourceId);
      return {
        handoff: {
          id: "handoff_mock",
          missionId: mission.id,
          handoffCardId: handoffCard.id,
          captureId: capture.id,
          sourceId: capture.sourceId,
          targetId: input.targetId,
          transformId: input.recipe,
          prompt,
          structured: {
            goal: "Deliver a structured handoff.",
            context: prompt,
            constraints: ["Keep data local until approval."],
            acceptanceCriteria: ["Preview is reviewed before delivery."],
            suggestedFiles: [],
            verificationSteps: ["Dry-run the target delivery."],
            originalCaptureRef: capture.id
          },
          redactionFindings: [],
          createdAt: now()
        },
        mission,
        handoffCard,
        taskSpec,
        artifacts,
        ...(source ? { source } : {}),
        ...(target ? { target } : {}),
        originalCaptureExcerpt: capture.text.slice(0, 320),
        deliveryStrategy: target?.kind === "codexDeepLink" ? "codexDeepLink" : "dryRun"
      };
    },
    async revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation> {
      return { status: "available", warnings: [], current: target };
    },
    async configureCodexTarget(repoPath: string) {
      const target: CodexDeepLinkTarget = {
        id: `target_codex_${mockTargets.length + 1}`,
        kind: "codexDeepLink",
        repoPath,
        openMode: "newThread",
        boundAt: now()
      };
      mockTargets = [target, ...mockTargets];
      mockComponents = mergeMockComponents([
        ...mockComponents,
        mockTargetComponent(target),
        mockRepoComponent(createMockRepoContext(repoPath), `mock_${target.id}`)
      ]);
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: "targetBound",
          entityId: target.id,
          details: { kind: "codexDeepLink", repoPath },
          createdAt: now()
        },
        ...mockAuditEvents
      ];
      return target;
    },
    async deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult> {
      const params = new URLSearchParams();
      const existingThreadId = input.codexThreadId ?? input.target.existingThreadId;
      if (!existingThreadId) {
        params.set("prompt", input.prompt);
        params.set("path", input.target.repoPath);
      }
      const attemptedAt = now();
      const deliveryMode = existingThreadId ? "existingDeepLinkOpen" : "newDeepLink";
      const warnings = existingThreadId ? ["Opened existing Codex thread only. Prompt was staged in AgentBridge but not sent into the existing thread."] : [];
      const deepLink = existingThreadId
        ? `codex://threads/${encodeURIComponent(existingThreadId)}`
        : `codex://threads/new?${params.toString()}`;
      const attempt = {
        id: `delivery_${Date.now()}`,
        handoffId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        targetId: input.target.id,
        strategy: "codexDeepLink" as const,
        success: true,
        warnings,
        targetMetadata: { dryRun: input.dryRun, repoPath: input.target.repoPath, deliveryMode, codexThreadId: existingThreadId },
        attemptedAt
      };
      const detail = mockMissionDetails.get(input.missionId);
      if (detail) {
        mockMissionDetails.set(input.missionId, {
          ...detail,
          mission: input.dryRun || existingThreadId ? detail.mission : { ...detail.mission, status: "delivered", updatedAt: attemptedAt },
          handoffCards: detail.handoffCards.map((card) =>
            card.id === input.handoffCardId
              ? { ...card, deliveryAttemptIds: [...card.deliveryAttemptIds, attempt.id], updatedAt: attemptedAt }
              : card
          ),
          deliveryAttempts: [attempt, ...detail.deliveryAttempts]
        });
        mockMissions = mockMissions.map((mission) =>
          mission.id === input.missionId ? mockMissionDetails.get(input.missionId)?.mission ?? mission : mission
        );
      }
      mockAuditEvents = [
        {
          id: `audit_${mockAuditEvents.length + 1}`,
          type: input.dryRun ? "deliveryAttempted" : "deliverySucceeded",
          entityId: input.handoffId,
          missionId: input.missionId,
          handoffCardId: input.handoffCardId,
          details: { targetId: input.target.id, dryRun: input.dryRun },
          createdAt: attemptedAt
        },
        ...mockAuditEvents
      ];
      return {
        success: true,
        deepLink,
        promptLength: input.prompt.length,
        repoPath: input.target.repoPath,
        deliveryMode,
        ...(existingThreadId ? { codexThreadId: existingThreadId, warnings } : {}),
        ...(input.dryRun ? {} : { openedAt: now() })
      };
    },
    async deliverHandoffCardToCodex(input: HandoffCardDeliveryRequest): Promise<CodexDeliveryResult> {
      const detail = mockMissionDetails.get(input.missionId);
      const card = detail?.handoffCards.find((item) => item.id === input.handoffCardId);
      const target = card ? mockTargets.find((item) => item.id === card.targetId) : undefined;
      if (!card || !target || target.kind !== "codexDeepLink") {
        throw new Error("HandoffCard target is not a Codex deep-link target.");
      }
      return this.deliverToCodex({
        target,
        prompt: card.generatedPrompt,
        dryRun: input.dryRun,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        handoffId: `handoff_card_${input.handoffCardId}`,
        ...(card.codexThreadId ? { codexThreadId: card.codexThreadId } : {}),
        ...(card.codexThreadName ? { codexThreadName: card.codexThreadName } : {}),
        ...(card.codexDeliveryMode ? { codexOpenMode: card.codexDeliveryMode } : {}),
        ...(card.codexIntegrationMode ? { codexIntegrationMode: card.codexIntegrationMode } : {})
      });
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
        content: "Mock verification captured a git diff summary.",
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
        captures: detail.captures,
        artifacts: [artifact, ...detail.artifacts],
        runs: [run, ...detail.runs],
        verificationResults: [result, ...detail.verificationResults]
      });
      mockMissions = mockMissions.map((mission) =>
        mission.id === input.missionId ? mockMissionDetails.get(input.missionId)?.mission ?? mission : mission
      );
      return { run, result, artifacts: [artifact] };
    },
    async getSetupStatus(): Promise<SetupStatus> {
      return mockSetupStatus(mockExtensionConnected);
    },
    async getPlatformStatus(): Promise<PlatformStatus> {
      return mockPlatformStatus;
    },
    async getCodexAppServerStatus(): Promise<CodexAppServerStatus> {
      mockCodexAppServerStatus = { ...mockCodexAppServerStatus, checkedAt: now() };
      return mockCodexAppServerStatus;
    },
    async configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus> {
      mockExtensionId = input.extensionId?.trim() || mockExtensionId || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      return mockSetupStatus(mockExtensionConnected);
    },
    async connectChrome(input?: ConfigureNativeHostRequest): Promise<SetupStatus> {
      mockExtensionId = input?.extensionId?.trim() || mockExtensionId || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      mockExtensionConnected = true;
      return mockSetupStatus(mockExtensionConnected);
    },
    async openChromeExtensionInstall() {
      return undefined;
    },
    async openChromeExtensionsPage() {
      return undefined;
    },
    async openChromeExtensionFolder() {
      return undefined;
    },
    async openEmbeddedChatGpt(input?: { url?: string }) {
      const source = {
        ...mockSource,
        url: input?.url?.trim() || mockSource.url,
        title: input?.url?.trim() ? "Existing ChatGPT conversation" : mockSource.title,
        browser: "agentbridge" as const
      };
      mockSources = [source, ...mockSources.filter((item) => item.id !== source.id)];
      mockComponents = mergeMockComponents([mockBrowserTabComponent(source), ...mockComponents]);
      return source;
    },
    async captureEmbeddedChatGptSelection() {
      const capture = {
        ...mockCapture,
        id: `cap_embedded_${Math.random().toString(16).slice(2)}`,
        metadata: { mode: "embeddedBrowser", source: { url: mockSource.url, title: mockSource.title, browser: "agentbridge" } },
        createdAt: now()
      };
      mockCaptures = [capture, ...mockCaptures];
      return capture;
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
    async openNativeHostLog() {
      return undefined;
    },
    async clearLocalData() {
      resetMockState({ includeDefaultCapture: true });
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

function mockBrowserTabComponent(source: BrowserTabSource): LinkableComponent {
  const provider = source.url.includes("chatgpt.com") ? "chatgpt" : "browser";
  return {
    id: `component_source_${source.id}`,
    kind: "browserTab",
    label: source.title || "Browser tab",
    subtitle: new URL(source.url).hostname,
    provider,
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
    compatibilityScore: provider === "chatgpt" ? 90 : 72,
    backingRef: { sourceId: source.id },
    metadata: { url: source.url, title: source.title },
    discoveredAt: source.boundAt,
    updatedAt: source.boundAt
  };
}

function mockTargetComponent(target: TargetEndpoint): LinkableComponent {
  if (target.kind === "codexDeepLink") {
    return {
      id: `component_target_${target.id}`,
      kind: "agentTarget",
      label: "Codex",
      subtitle: "Official deep-link target",
      provider: "codex",
      roleCapabilities: {
        canBeSource: false,
        canBeTarget: true,
        canBeWorkspace: false,
        canCapture: false,
        canDeliver: true,
        canVerify: false,
        canObserve: false
      },
      riskLevel: "low",
      status: "available",
      compatibilityScore: 96,
      backingRef: { targetId: target.id, repoPath: target.repoPath },
      metadata: { repoPath: target.repoPath, delivery: "codex://" },
      discoveredAt: target.boundAt,
      updatedAt: target.boundAt
    };
  }

  return {
    id: `component_target_${target.kind}`,
    kind: "desktopWindow",
    label: target.kind,
    subtitle: "Mock target",
    provider: "unknown",
    roleCapabilities: {
      canBeSource: false,
      canBeTarget: true,
      canBeWorkspace: false,
      canCapture: false,
      canDeliver: false,
      canVerify: false,
      canObserve: false
    },
    riskLevel: "medium",
    status: "unsupported",
    compatibilityScore: 30,
    backingRef: {},
    metadata: { kind: target.kind },
    discoveredAt: now(),
    updatedAt: now()
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
      canBeSource: false,
      canBeTarget: false,
      canBeWorkspace: true,
      canCapture: false,
      canDeliver: false,
      canVerify: true,
      canObserve: false
    },
    riskLevel: "low",
    status: "available",
    compatibilityScore: 92,
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
    constraints: ["Do not require Chrome extension setup."],
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
    sourceId: "provider:chatgpt-manual",
    captureId: "mock_planner_turn",
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

function mockSetupStatus(extensionConnected = false): SetupStatus {
  return {
    ...(mockExtensionId ? { extensionId: mockExtensionId } : {}),
    webStoreUrl: "https://chrome.google.com/webstore/detail/agentbridge/mock",
    extensionIdentityMode: mockExtensionId ? "developmentManual" : "developmentManual",
    extensionIdKnown: Boolean(mockExtensionId),
    extensionConnected,
    ...(extensionConnected ? { lastExtensionHeartbeatAt: now(), lastExtensionMessageType: "healthCheck", extensionVersion: "0.1.0" } : {}),
    nativeHostRegistered: Boolean(mockExtensionId),
    nativeHostPathValid: Boolean(mockExtensionId),
    allowedOriginMatches: Boolean(mockExtensionId),
    repairNeeded: !mockExtensionId,
    ...(mockExtensionId ? { nativeHostManifestPath: "mock://com.agentbridge.native_host.json" } : {}),
    ...(mockExtensionId ? { nativeHostLauncherPath: "mock://agentbridge-native-host.cmd" } : {}),
    nativeHostScriptPath: "mock://native-host/native-host.mjs",
    winUiaHelperPath: "mock://win-uia-helper/AgentBridge.WinUiaHelper.exe",
    mode: "development",
    devServerUrl: "http://127.0.0.1:5173/",
    storePath: "mock://AgentBridge",
    checks: [
      { id: "storeWritable", label: "Local store writable", status: "ready", details: "mock://AgentBridge" },
      {
        id: "extensionId",
        label: "Chrome extension ID configured",
        status: mockExtensionId ? "ready" : "missing",
        details: mockExtensionId || "No extension ID saved."
      },
      {
        id: "nativeHostManifest",
        label: "Native host manifest registered",
        status: mockExtensionId ? "ready" : "missing",
        details: mockExtensionId ? "Mock manifest registered." : "No registry entry found."
      },
      {
        id: "nativeHostPath",
        label: "Native host launcher path valid",
        status: mockExtensionId ? "ready" : "missing",
        details: mockExtensionId ? "Mock launcher path valid." : "No launcher path found."
      },
      {
        id: "allowedOrigin",
        label: "Manifest allows extension",
        status: mockExtensionId ? "ready" : "missing",
        details: mockExtensionId ? `chrome-extension://${mockExtensionId}/` : "No extension ID to validate."
      },
      {
        id: "extensionHealth",
        label: "Extension health check",
        status: "warning",
        details: "Run Health check from the extension popup after registration."
      },
      {
        id: "codexTarget",
        label: "Codex target configured",
        status: mockTargets.some((target) => target.kind === "codexDeepLink") ? "ready" : "missing",
        details: mockTargets.some((target) => target.kind === "codexDeepLink")
          ? "At least one Codex target is saved."
          : "Configure a Codex repo path in Settings."
      }
    ]
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
  if (recipe === "rawRelay") {
    return text;
  }

  return [
    "Goal:",
    "Implement the requested AgentBridge workflow.",
    "",
    "Context:",
    text,
    "",
    "Acceptance criteria:",
    "- Capture remains user-triggered.",
    "- Approval preview is shown before delivery.",
    "- Codex delivery uses a deep link."
  ].join("\n");
}
