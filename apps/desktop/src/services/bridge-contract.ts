import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  CodexIntegrationMode,
  CodexOpenMode,
  CodexThreadRef,
  DeliveryAttempt,
  Artifact,
  ArtifactBundle,
  ArtifactFile,
  HandoffCard,
  Handoff,
  Link,
  LinkableComponent,
  Mission,
  Run,
  VerificationCommand,
  SourceEndpoint,
  TaskSpec,
  TargetEndpoint,
  WindowsDesktopWindowTarget,
  AuditEvent,
  AgentEvent,
  AgentBridgeCloudAuthStatus,
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  ExecutorTaskResult,
  PlannerProviderMode,
  PlannerRequest,
  PlannerResponse,
  PlatformCapabilities,
  ReviewResult,
  VerificationResult,
  WorkflowLink,
  WorkspaceCandidate
} from "@agentbridge/core";
import type { AgentEventFilter } from "@agentbridge/local-store";
import type { RepoCommandConfig } from "./repo-context-service.js";
import type { AttachWorkspaceInput, CreateWorkbenchMissionInput } from "./workbench-service.js";
import type { AutopilotStatus } from "./autopilot-service.js";
import type { PlannerModeInfo } from "./provider-registry-service.js";
export type { AutopilotStatus } from "./autopilot-service.js";

export interface WindowRevalidation {
  status: "available" | "changed" | "unavailable";
  warnings: string[];
  current?: WindowsDesktopWindowTarget;
}

export interface ComponentDiscoveryResponse {
  components: LinkableComponent[];
  warnings: string[];
}

export interface PreviewRequest {
  captureId: string;
  targetId: string;
  recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
  missionId?: string;
  codexThreadId?: string;
  codexThreadName?: string;
  codexOpenMode?: CodexOpenMode;
  codexIntegrationMode?: CodexIntegrationMode;
}

export interface DeliveryPreview {
  handoff: Handoff;
  mission: Mission;
  handoffCard: HandoffCard;
  taskSpec: TaskSpec;
  artifacts: Artifact[];
  source?: SourceEndpoint | undefined;
  target?: TargetEndpoint | undefined;
  originalCaptureExcerpt: string;
  deliveryStrategy: string;
}

export interface CodexDeliveryRequest {
  target: CodexDeepLinkTarget;
  prompt: string;
  dryRun: boolean;
  missionId: string;
  handoffCardId: string;
  handoffId: string;
  codexThreadId?: string;
  codexThreadName?: string;
  codexOpenMode?: CodexOpenMode;
  codexIntegrationMode?: CodexIntegrationMode;
}

export interface HandoffCardDeliveryRequest {
  missionId: string;
  handoffCardId: string;
  dryRun: boolean;
}

export interface CodexDeliveryResult {
  success: boolean;
  deepLink: string;
  promptLength: number;
  repoPath: string;
  deliveryMode?: "newDeepLink" | "existingDeepLinkOpen" | "appServerTurnStart" | "sdkRun";
  codexThreadId?: string;
  codexTurnId?: string;
  warnings?: string[];
  openedAt?: string;
  error?: string;
}

export interface CodexAppServerStatus {
  configured: boolean;
  endpoint?: string;
  available: boolean;
  canSendIntoExistingThreads: boolean;
  message?: string;
  checkedAt: string;
}

export interface PlatformStatus {
  capabilities: PlatformCapabilities;
  userDataDir: string;
  artifactRoot: string;
  stagingRoot: string;
  logsDir: string;
  defaultShell: string;
}

export interface AgentBridgeCurrentUser {
  id: string;
  email?: string;
}

export interface AgentBridgeAuthStatus {
  status: AgentBridgeCloudAuthStatus;
  signedIn: boolean;
  cloudBaseUrl: string;
  mode: "development" | "production";
  user?: AgentBridgeCurrentUser;
  error?: string;
}

export interface MissionDetail {
  mission: Mission;
  handoffCards: HandoffCard[];
  captures: Capture[];
  artifacts: Artifact[];
  artifactFiles?: ArtifactFile[];
  artifactBundles?: ArtifactBundle[];
  deliveryAttempts: DeliveryAttempt[];
  runs: Run[];
  verificationResults: VerificationResult[];
  agentEvents?: AgentEvent[];
}

export interface VerificationRunRequest {
  missionId: string;
  commands?: VerificationCommand[];
}

export interface VerificationRunResponse {
  run: Run;
  result: VerificationResult;
  artifacts: Artifact[];
}

export type SetupCheckStatus = "ready" | "warning" | "missing";

export interface SetupCheck {
  id: string;
  label: string;
  status: SetupCheckStatus;
  details: string;
}

export interface SetupStatus {
  checks: SetupCheck[];
  extensionId?: string;
  webStoreUrl?: string;
  extensionIdentityMode: "production" | "preproductionStableKey" | "developmentManual";
  extensionIdKnown: boolean;
  extensionConnected: boolean;
  lastExtensionHeartbeatAt?: string;
  lastExtensionMessageType?: string;
  extensionVersion?: string;
  nativeHostRegistered: boolean;
  nativeHostPathValid: boolean;
  allowedOriginMatches: boolean;
  repairNeeded: boolean;
  nativeHostManifestPath?: string;
  nativeHostLauncherPath?: string;
  nativeHostScriptPath?: string;
  winUiaHelperPath?: string;
  mode: "development" | "packaged";
  devServerUrl?: string;
  storePath: string;
}

export interface ConfigureNativeHostRequest {
  extensionId?: string;
}

export interface AgentBridgeApi {
  listSources(): Promise<SourceEndpoint[]>;
  listTargets(): Promise<TargetEndpoint[]>;
  listLinks(): Promise<Link[]>;
  listLinkableComponents(): Promise<LinkableComponent[]>;
  discoverLinkableComponents(): Promise<ComponentDiscoveryResponse>;
  listWorkflowLinks(): Promise<WorkflowLink[]>;
  createWorkflowLink(input: {
    name: string;
    sourceComponentId: string;
    workspaceComponentId?: string;
    targetComponentId: string;
    recipe: WorkflowLink["recipe"];
    verificationCommandDefaults?: VerificationCommand[];
    codexThreadId?: string;
    codexThreadName?: string;
    codexOpenMode?: CodexOpenMode;
    codexIntegrationMode?: CodexIntegrationMode;
  }): Promise<WorkflowLink>;
  createTaskFromWorkflowLink(input: { workflowLinkId: string }): Promise<DeliveryPreview>;
  listCodexThreads(repoPath?: string): Promise<CodexThreadRef[]>;
  saveManualCodexThreadRef(input: { threadId: string; name?: string; repoPath?: string }): Promise<CodexThreadRef>;
  listProviders(): Promise<AgentProviderProfile[]>;
  getProviderStatus(providerId: string): Promise<AgentProviderProfile | undefined>;
  createAgentSession(
    providerId: string,
    input?: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }
  ): Promise<AgentSessionRef>;
  resumeAgentSession(providerId: string, sessionRefId: string): Promise<AgentSessionRef>;
  sendProviderMessage(
    providerId: string,
    sessionRefId: string,
    message: string,
    context?: PlannerRequest
  ): Promise<AgentTurn>;
  listAgentSessions(providerId?: string): Promise<AgentSessionRef[]>;
  listAgentTurns(sessionRefId: string): Promise<AgentTurn[]>;
  listAgentEvents(filter?: AgentEventFilter): Promise<AgentEvent[]>;
  getPlannerMode(): Promise<PlannerProviderMode>;
  setPlannerMode(mode: PlannerProviderMode): Promise<PlannerProviderMode>;
  listPlannerModes(): Promise<PlannerModeInfo[]>;
  getActivePlannerProvider(): Promise<AgentProviderProfile | undefined>;
  getAgentBridgeAuthStatus(): Promise<AgentBridgeAuthStatus>;
  signInAgentBridgeDevMode(): Promise<AgentBridgeAuthStatus>;
  signOutAgentBridge(): Promise<AgentBridgeAuthStatus>;
  getAgentBridgeCurrentUser(): Promise<AgentBridgeCurrentUser | undefined>;
  setAgentBridgeCloudBaseUrl(url: string): Promise<AgentBridgeAuthStatus>;
  inferWorkspaceForMission(missionId: string): Promise<WorkspaceCandidate[]>;
  confirmWorkspaceCandidate(candidateId: string): Promise<WorkspaceCandidate | undefined>;
  attachWorkspaceToMission(missionId: string, input: AttachWorkspaceInput): Promise<Mission>;
  createWorkbenchMission(input?: CreateWorkbenchMissionInput): Promise<Mission>;
  sendUserMessageToPlanner(missionId: string, text: string): Promise<PlannerResponse>;
  createTaskSpecFromLatestPlannerTurn(missionId: string): Promise<HandoffCard>;
  sendTaskSpecToExecutor(missionId: string, executorProviderId?: string, sessionRefId?: string): Promise<ExecutorTaskResult>;
  runMissionWorkbenchVerification(missionId: string, input?: Omit<VerificationRunRequest, "missionId">): Promise<VerificationRunResponse>;
  sendVerificationToPlannerForReview(missionId: string): Promise<ReviewResult>;
  createFollowUpFromPlannerReview(missionId: string): Promise<HandoffCard>;
  sendFollowUpToExecutor(missionId: string, sessionRefId?: string): Promise<ExecutorTaskResult>;
  startAutopilot(missionId: string, policyId?: string): Promise<AutopilotStatus>;
  stopAutopilot(autopilotRunId: string): Promise<AutopilotStatus>;
  continueAutopilot(autopilotRunId: string): Promise<AutopilotStatus>;
  steerAutopilot(autopilotRunId: string, text: string): Promise<AutopilotStatus>;
  getAutopilotStatus(missionId: string): Promise<AutopilotStatus>;
  resolvePendingDecision(decisionId: string, selectedOption: string): Promise<AutopilotStatus>;
  listCaptures(): Promise<Capture[]>;
  listMissions(): Promise<Mission[]>;
  getMissionDetail(id: string): Promise<MissionDetail | undefined>;
  createLink(input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled"> & { name: string }): Promise<Link>;
  previewHandoff(input: PreviewRequest): Promise<DeliveryPreview>;
  revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation>;
  configureCodexTarget(repoPath: string, commands?: RepoCommandConfig): Promise<CodexDeepLinkTarget>;
  deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult>;
  deliverHandoffCardToCodex(input: HandoffCardDeliveryRequest): Promise<CodexDeliveryResult>;
  runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse>;
  getSetupStatus(): Promise<SetupStatus>;
  getPlatformStatus(): Promise<PlatformStatus>;
  getCodexAppServerStatus(): Promise<CodexAppServerStatus>;
  configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus>;
  connectChrome(input?: ConfigureNativeHostRequest): Promise<SetupStatus>;
  openChromeExtensionInstall(): Promise<void>;
  openChromeExtensionsPage(): Promise<void>;
  openChromeExtensionFolder(): Promise<void>;
  openEmbeddedChatGpt(input?: { url?: string }): Promise<BrowserTabSource>;
  captureEmbeddedChatGptSelection(): Promise<Capture>;
  selectRepoFolder(): Promise<string | undefined>;
  openDataFolder(): Promise<void>;
  revealArtifactFile(fileId: string): Promise<void>;
  openNativeHostLog(): Promise<void>;
  clearLocalData(): Promise<void>;
  bindMockBrowserSource(): Promise<BrowserTabSource>;
  listAuditEvents(): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
}

declare global {
  interface Window {
    agentBridge?: AgentBridgeApi;
  }
}
