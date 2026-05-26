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
  WindowRevalidation
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
  WindowsDesktopWindowTarget
} from "@agentbridge/core";

const now = () => new Date().toISOString();

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
let mockExtensionId = "";
let mockExtensionConnected = false;
let mockCodexAppServerStatus: CodexAppServerStatus = {
  configured: false,
  available: false,
  canSendIntoExistingThreads: false,
  message: "Codex App Server endpoint is not configured.",
  checkedAt: now()
};

export function getAgentBridgeApi(): AgentBridgeApi {
  return window.agentBridge ?? createMockAgentBridgeApi();
}

function createMockAgentBridgeApi(): AgentBridgeApi {
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
    async openEmbeddedChatGpt() {
      mockSources = [mockSource, ...mockSources.filter((source) => source.id !== mockSource.id)];
      mockComponents = mergeMockComponents([mockBrowserTabComponent(mockSource), ...mockComponents]);
      return mockSource;
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
    async openNativeHostLog() {
      return undefined;
    },
    async clearLocalData() {
      mockSources = [mockSource];
      mockTargets = [];
      mockLinks = [];
      mockWorkflowLinks = [];
      mockCodexThreads = [];
      mockComponents = [mockBrowserTabComponent(mockSource)];
      mockCaptures = [mockCapture];
      mockAuditEvents = [];
      mockMissions = [];
      mockMissionDetails = new Map<string, MissionDetail>();
      mockExtensionConnected = false;
      mockCodexAppServerStatus = {
        configured: false,
        available: false,
        canSendIntoExistingThreads: false,
        message: "Codex App Server endpoint is not configured.",
        checkedAt: now()
      };
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
