import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  DeliveryAttempt,
  Artifact,
  HandoffCard,
  Handoff,
  Link,
  Mission,
  Run,
  VerificationCommand,
  SourceEndpoint,
  TaskSpec,
  TargetEndpoint,
  WindowsDesktopWindowTarget,
  AuditEvent,
  VerificationResult
} from "@agentbridge/core";
import type { RepoCommandConfig } from "./repo-context-service.js";

export interface WindowRevalidation {
  status: "available" | "changed" | "unavailable";
  warnings: string[];
  current?: WindowsDesktopWindowTarget;
}

export interface PreviewRequest {
  captureId: string;
  targetId: string;
  recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
  missionId?: string;
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
  handoffId?: string;
}

export interface CodexDeliveryResult {
  success: boolean;
  deepLink: string;
  promptLength: number;
  repoPath: string;
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
  nativeHostManifestPath?: string;
  nativeHostLauncherPath?: string;
  storePath: string;
}

export interface ConfigureNativeHostRequest {
  extensionId: string;
}

export interface AgentBridgeApi {
  listSources(): Promise<SourceEndpoint[]>;
  listTargets(): Promise<TargetEndpoint[]>;
  listLinks(): Promise<Link[]>;
  listCaptures(): Promise<Capture[]>;
  listMissions(): Promise<Mission[]>;
  getMissionDetail(id: string): Promise<MissionDetail | undefined>;
  createLink(input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled"> & { name: string }): Promise<Link>;
  previewHandoff(input: PreviewRequest): Promise<DeliveryPreview>;
  revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation>;
  configureCodexTarget(repoPath: string, commands?: RepoCommandConfig): Promise<CodexDeepLinkTarget>;
  deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult>;
  runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse>;
  getSetupStatus(): Promise<SetupStatus>;
  configureNativeHost(input: ConfigureNativeHostRequest): Promise<SetupStatus>;
  bindMockBrowserSource(): Promise<BrowserTabSource>;
  listAuditEvents(): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
}

declare global {
  interface Window {
    agentBridge?: AgentBridgeApi;
  }
}
