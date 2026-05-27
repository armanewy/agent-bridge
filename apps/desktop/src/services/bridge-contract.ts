import type {
  CompletionContract,
  CompletionEvidence,
  CodexThreadRef,
  DeliveryAttempt,
  FileOwnership,
  Artifact,
  ArtifactBundle,
  ArtifactFile,
  HandoffCard,
  LinkableComponent,
  Mission,
  MissionWorkspace,
  Run,
  VerificationCommand,
  TaskSpec,
  TargetEndpoint,
  WindowsDesktopWindowTarget,
  AuditEvent,
  AgentEvent,
  AgentBridgeCloudAuthStatus,
  AgentProviderProfile,
  AgentSessionRef,
  ExecutorTaskResult,
  PlatformCapabilities,
  VerificationResult,
  WorkspaceCandidate
} from "@agentbridge/core";
import type { AttachWorkspaceInput, CreateWorkbenchMissionInput } from "./workbench-service.js";
import type { AutopilotStatus } from "./autopilot-service.js";
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
  artifacts: Artifact[];
  artifactFiles?: ArtifactFile[];
  artifactBundles?: ArtifactBundle[];
  completionContracts?: CompletionContract[];
  completionEvidence?: CompletionEvidence[];
  missionWorkspaces?: MissionWorkspace[];
  fileOwnership?: FileOwnership[];
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

export interface ChatGptSelection {
  text: string;
  title: string;
  url: string;
}

export interface AgentBridgeApi {
  listTargets(): Promise<TargetEndpoint[]>;
  listLinkableComponents(): Promise<LinkableComponent[]>;
  discoverLinkableComponents(): Promise<ComponentDiscoveryResponse>;
  listCodexThreads(repoPath?: string): Promise<CodexThreadRef[]>;
  listProviders(): Promise<AgentProviderProfile[]>;
  getProviderStatus(providerId: string): Promise<AgentProviderProfile | undefined>;
  createAgentSession(
    providerId: string,
    input?: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }
  ): Promise<AgentSessionRef>;
  resumeAgentSession(providerId: string, sessionRefId: string): Promise<AgentSessionRef>;
  listAgentSessions(providerId?: string): Promise<AgentSessionRef[]>;
  getAgentBridgeAuthStatus(): Promise<AgentBridgeAuthStatus>;
  signInAgentBridgeDevMode(): Promise<AgentBridgeAuthStatus>;
  signOutAgentBridge(): Promise<AgentBridgeAuthStatus>;
  getAgentBridgeCurrentUser(): Promise<AgentBridgeCurrentUser | undefined>;
  setAgentBridgeCloudBaseUrl(url: string): Promise<AgentBridgeAuthStatus>;
  inferWorkspaceForMission(missionId: string): Promise<WorkspaceCandidate[]>;
  confirmWorkspaceCandidate(candidateId: string): Promise<WorkspaceCandidate | undefined>;
  attachWorkspaceToMission(missionId: string, input: AttachWorkspaceInput): Promise<Mission>;
  createWorkbenchMission(input?: CreateWorkbenchMissionInput): Promise<Mission>;
  createTaskSpecFromLatestPlannerTurn(missionId: string): Promise<HandoffCard>;
  sendTaskSpecToExecutor(missionId: string, executorProviderId?: string, sessionRefId?: string): Promise<ExecutorTaskResult>;
  runMissionWorkbenchVerification(missionId: string, input?: Omit<VerificationRunRequest, "missionId">): Promise<VerificationRunResponse>;
  createFollowUpFromPlannerReview(missionId: string): Promise<HandoffCard>;
  sendFollowUpToExecutor(missionId: string, sessionRefId?: string): Promise<ExecutorTaskResult>;
  startAutopilot(missionId: string, policyId?: string): Promise<AutopilotStatus>;
  stopAutopilot(autopilotRunId: string): Promise<AutopilotStatus>;
  continueAutopilot(autopilotRunId: string): Promise<AutopilotStatus>;
  steerAutopilot(autopilotRunId: string, text: string): Promise<AutopilotStatus>;
  getAutopilotStatus(missionId: string): Promise<AutopilotStatus>;
  resolvePendingDecision(decisionId: string, selectedOption: string): Promise<AutopilotStatus>;
  listMissions(): Promise<Mission[]>;
  getMissionDetail(id: string): Promise<MissionDetail | undefined>;
  revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation>;
  runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse>;
  getPlatformStatus(): Promise<PlatformStatus>;
  getCodexAppServerStatus(): Promise<CodexAppServerStatus>;
  openEmbeddedChatGpt(input?: { url?: string }): Promise<void>;
  importEmbeddedChatGptSelection(): Promise<ChatGptSelection>;
  selectRepoFolder(): Promise<string | undefined>;
  openDataFolder(): Promise<void>;
  revealArtifactFile(fileId: string): Promise<void>;
  clearLocalData(): Promise<void>;
  listAuditEvents(): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
}

declare global {
  interface Window {
    agentBridge?: AgentBridgeApi;
  }
}
