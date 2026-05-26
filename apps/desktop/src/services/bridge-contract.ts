import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  CodexIntegrationMode,
  CodexOpenMode,
  CodexThreadRef,
  DeliveryAttempt,
  Artifact,
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
  VerificationResult,
  WorkflowLink
} from "@agentbridge/core";
import type { RepoCommandConfig } from "./repo-context-service.js";

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

export interface MissionDetail {
  mission: Mission;
  handoffCards: HandoffCard[];
  captures: Capture[];
  artifacts: Artifact[];
  deliveryAttempts: DeliveryAttempt[];
  runs: Run[];
  verificationResults: VerificationResult[];
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
  configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus>;
  connectChrome(): Promise<SetupStatus>;
  openChromeExtensionInstall(): Promise<void>;
  selectRepoFolder(): Promise<string | undefined>;
  openDataFolder(): Promise<void>;
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
