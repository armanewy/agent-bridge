import { z } from "zod";

export const TimestampSchema = z.string().min(1);

export const PlatformKindSchema = z.enum(["windows", "macos", "linux", "unknown"]);
export type PlatformKind = z.infer<typeof PlatformKindSchema>;

export const PlatformCapabilitiesSchema = z.object({
  platform: PlatformKindSchema,
  canPackageDesktopApp: z.boolean(),
  canRunShellCommands: z.boolean(),
  canOpenExternalLinks: z.boolean(),
  canUseCodexAppServer: z.boolean(),
  canUseDesktopAutomation: z.boolean(),
  canUseWindowsUia: z.boolean(),
  canUseMacAccessibility: z.boolean(),
  canUseAppleEvents: z.boolean(),
  canUseGlobalShortcuts: z.boolean(),
  canUseTray: z.boolean(),
  canUseFilePicker: z.boolean(),
  canUseUserSelectedRepoAccess: z.boolean()
});
export type PlatformCapabilities = z.infer<typeof PlatformCapabilitiesSchema>;

export const LinkableComponentKindSchema = z.enum([
  "codexDesktop",
  "codexThread",
  "desktopWindow",
  "repo",
  "agentTarget",
  "terminal",
  "ide",
  "unknown"
]);
export type LinkableComponentKind = z.infer<typeof LinkableComponentKindSchema>;

export const ComponentProviderSchema = z.enum([
  "chatgpt",
  "claude",
  "gemini",
  "github",
  "codex",
  "codexDesktop",
  "codexThread",
  "vscode",
  "cursor",
  "terminal",
  "repo",
  "unknown"
]);
export type ComponentProvider = z.infer<typeof ComponentProviderSchema>;

export const ComponentRoleCapabilitiesSchema = z.object({
  canBeTarget: z.boolean(),
  canBeWorkspace: z.boolean(),
  canDeliver: z.boolean(),
  canVerify: z.boolean(),
  canObserve: z.boolean(),
  canListSessions: z.boolean().optional(),
  canReadSelectedText: z.boolean().optional(),
  canReadLatestMessage: z.boolean().optional(),
  canResumeThread: z.boolean().optional(),
  canStartTurn: z.boolean().optional()
});
export type ComponentRoleCapabilities = z.infer<typeof ComponentRoleCapabilitiesSchema>;

export const LinkableComponentSchema = z.object({
  id: z.string().min(1),
  kind: LinkableComponentKindSchema,
  label: z.string().min(1),
  subtitle: z.string(),
  provider: ComponentProviderSchema,
  roleCapabilities: ComponentRoleCapabilitiesSchema,
  riskLevel: z.enum(["low", "medium", "high"]),
  status: z.enum(["available", "permission_needed", "unsupported", "unavailable"]),
  fitScore: z.number().int().min(0).max(100),
  backingRef: z.object({
    targetId: z.string().optional(),
    repoPath: z.string().optional(),
    hwnd: z.string().optional(),
    sessionId: z.string().optional(),
    processId: z.number().int().optional(),
    codexThreadId: z.string().optional()
  }),
  metadata: z.record(z.unknown()),
  discoveredAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type LinkableComponent = z.infer<typeof LinkableComponentSchema>;

export const WindowsDesktopWindowTargetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("windowsDesktopWindow"),
  hwnd: z.string().min(1),
  processId: z.number().int().positive().optional(),
  title: z.string(),
  executablePath: z.string().optional(),
  className: z.string().optional(),
  boundAt: TimestampSchema
});
export type WindowsDesktopWindowTarget = z.infer<typeof WindowsDesktopWindowTargetSchema>;

export const CodexThreadStatusSchema = z.enum(["unknown", "notLoaded", "idle", "active", "systemError", "archived"]);
export type CodexThreadStatus = z.infer<typeof CodexThreadStatusSchema>;

export const CodexThreadSourceSchema = z.literal("appServer");
export type CodexThreadSource = z.infer<typeof CodexThreadSourceSchema>;

export const CodexThreadRefSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  name: z.string().optional(),
  repoPath: z.string().optional(),
  status: CodexThreadStatusSchema.optional(),
  source: CodexThreadSourceSchema,
  lastSeenAt: TimestampSchema,
  metadata: z.record(z.unknown()).default({})
});
export type CodexThreadRef = z.infer<typeof CodexThreadRefSchema>;

export const TargetEndpointSchema = WindowsDesktopWindowTargetSchema;
export type TargetEndpoint = z.infer<typeof TargetEndpointSchema>;

export const RedactionFindingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["apiKey", "bearerToken", "privateKey", "envAssignment", "email", "highEntropyToken"]),
  severity: z.enum(["high", "medium", "low"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  preview: z.string(),
  recommendation: z.enum(["redact", "warn"])
});
export type RedactionFinding = z.infer<typeof RedactionFindingSchema>;

export const MissionStatusSchema = z.enum([
  "draft",
  "planned",
  "ready",
  "approved",
  "delivered",
  "verifying",
  "passed",
  "failed",
  "needs_review",
  "cancelled"
]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const TaskSpecSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  background: z.string(),
  instructions: z.array(z.string()),
  requirements: z.array(z.string()),
  constraints: z.array(z.string()),
  nonGoals: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  suggestedFiles: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  expectedSummaryFormat: z.string()
});
export type TaskSpec = z.infer<typeof TaskSpecSchema>;

export const RepoContextPackSchema = z.object({
  repoPath: z.string().min(1),
  repoName: z.string().optional(),
  currentBranch: z.string().optional(),
  worktreePath: z.string().optional(),
  gitStatusSummary: z.string().optional(),
  changedFiles: z.array(z.string()).optional(),
  relevantFiles: z.array(z.string()).optional(),
  packageManager: z.string().optional(),
  testCommand: z.string().optional(),
  lintCommand: z.string().optional(),
  typecheckCommand: z.string().optional()
});
export type RepoContextPack = z.infer<typeof RepoContextPackSchema>;

export const VerificationCommandSchema = z.object({
  kind: z.enum(["test", "lint", "typecheck", "custom"]),
  command: z.string().min(1),
  cwd: z.string().optional()
});
export type VerificationCommand = z.infer<typeof VerificationCommandSchema>;

export const VerificationPlanSchema = z.object({
  commands: z.array(VerificationCommandSchema),
  manualChecklist: z.array(z.string()),
  expectedArtifacts: z.array(z.string()),
  acceptanceCriteriaRefs: z.array(z.string()).optional()
});
export type VerificationPlan = z.infer<typeof VerificationPlanSchema>;

export const MissionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: MissionStatusSchema,
  handoffCardIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
  runIds: z.array(z.string()),
  repoContext: RepoContextPackSchema.optional(),
  workflowTemplateId: z.string().optional(),
  roleSessionRefs: z.record(z.string()).optional(),
  verificationPlan: VerificationPlanSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type Mission = z.infer<typeof MissionSchema>;

export const ArtifactKindSchema = z.enum([
  "taskSpec",
  "generatedPrompt",
  "deliveryResult",
  "gitDiff",
  "testOutput",
  "lintOutput",
  "typecheckOutput",
  "terminalLog",
  "modelResponse",
  "reviewNote",
  "screenshot",
  "fileReference"
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  runId: z.string().optional(),
  handoffCardId: z.string().optional(),
  kind: ArtifactKindSchema,
  title: z.string().min(1),
  content: z.string().optional(),
  filePath: z.string().optional(),
  metadata: z.record(z.unknown()),
  createdAt: TimestampSchema
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ArtifactFileClassificationSchema = z.enum([
  "sourceCode",
  "patch",
  "diff",
  "log",
  "screenshot",
  "document",
  "archive",
  "generatedAsset",
  "unknown"
]);
export type ArtifactFileClassification = z.infer<typeof ArtifactFileClassificationSchema>;

export const ArtifactFileSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  missionId: z.string().min(1),
  fileName: z.string().min(1),
  localPath: z.string().min(1),
  relativePath: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  createdByProviderId: z.string().optional(),
  sourceTurnId: z.string().optional(),
  classification: ArtifactFileClassificationSchema,
  createdAt: TimestampSchema
});
export type ArtifactFile = z.infer<typeof ArtifactFileSchema>;

export const ArtifactBundleSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  name: z.string().min(1),
  artifactIds: z.array(z.string()),
  fileIds: z.array(z.string()),
  purpose: z.enum(["plannerInput", "executorInput", "verificationInput", "reviewInput", "userDownload", "archive"]),
  createdAt: TimestampSchema
});
export type ArtifactBundle = z.infer<typeof ArtifactBundleSchema>;

export const HandoffCardSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  inputArtifactId: z.string().min(1),
  targetId: z.string().min(1),
  recipe: z.enum(["implementationBrief", "debuggingRequest"]),
  taskSpec: TaskSpecSchema,
  generatedPrompt: z.string().min(1),
  repoContext: RepoContextPackSchema.optional(),
  redactionFindings: z.array(RedactionFindingSchema),
  approvalId: z.string().optional(),
  deliveryAttemptIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
  codexThreadId: z.string().optional(),
  codexThreadName: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type HandoffCard = z.infer<typeof HandoffCardSchema>;

export const CommandResultSchema = z.object({
  kind: z.enum(["test", "lint", "typecheck", "custom"]),
  command: z.string().min(1),
  exitCode: z.number().int().optional(),
  status: z.enum(["not_run", "passed", "failed", "warning"]),
  outputArtifactId: z.string().optional(),
  durationMs: z.number().nonnegative().optional()
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

export const VerificationResultSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  runId: z.string().optional(),
  status: z.enum(["not_run", "pending", "passed", "failed", "warning", "needs_review"]),
  commandResults: z.array(CommandResultSchema),
  summary: z.string(),
  artifactIds: z.array(z.string()),
  createdAt: TimestampSchema
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const AgentProviderKindSchema = z.enum(["executor", "verifier", "repository", "unknown"]);
export type AgentProviderKind = z.infer<typeof AgentProviderKindSchema>;

export const AgentProviderCapabilitySchema = z.enum([
  "canExecuteCode",
  "canUseRepo",
  "canListSessions",
  "canCreateSession",
  "canResumeSession",
  "canSendMessage",
  "canStreamEvents",
  "canReadResult",
  "canReturnArtifacts",
  "canRunTools",
  "canVerify"
]);
export type AgentProviderCapability = z.infer<typeof AgentProviderCapabilitySchema>;

export const AgentBridgeCloudAuthStatusSchema = z.enum(["signedOut", "signedIn", "expired", "unavailable"]);
export type AgentBridgeCloudAuthStatus = z.infer<typeof AgentBridgeCloudAuthStatusSchema>;

export const WorkspaceCandidateSourceSchema = z.enum([
  "codexAppServerThread",
  "agentBridgeHistory",
  "githubUrl",
  "providerSelfReport",
  "windowTitle",
  "userSelected"
]);
export type WorkspaceCandidateSource = z.infer<typeof WorkspaceCandidateSourceSchema>;

export const WorkspaceCandidateSchema = z.object({
  id: z.string().min(1),
  repoName: z.string().optional(),
  repoPath: z.string().optional(),
  branch: z.string().optional(),
  remoteUrl: z.string().url().optional(),
  source: WorkspaceCandidateSourceSchema,
  confidence: z.number().int().min(0).max(100),
  evidence: z.array(z.string()),
  requiresConfirmation: z.boolean(),
  createdAt: TimestampSchema
});
export type WorkspaceCandidate = z.infer<typeof WorkspaceCandidateSchema>;

export const AgentProviderAuthModeSchema = z.enum(["apiKey", "agentBridgeCloud", "localApp", "appServer", "cli", "none", "unknown"]);
export type AgentProviderAuthMode = z.infer<typeof AgentProviderAuthModeSchema>;

export const AgentProviderStatusSchema = z.enum(["available", "needsAuth", "unavailable", "unsupported"]);
export type AgentProviderStatus = z.infer<typeof AgentProviderStatusSchema>;

export const ProviderArtifactCapabilitiesSchema = z.object({
  canAcceptTextArtifacts: z.boolean(),
  canAcceptFileInputs: z.boolean(),
  canAcceptFilePaths: z.boolean(),
  canReturnTextArtifacts: z.boolean(),
  canReturnFileArtifacts: z.boolean(),
  canReturnDiffs: z.boolean(),
  canReturnLogs: z.boolean(),
  canReturnScreenshots: z.boolean(),
  maxInputFileBytes: z.number().int().positive().optional(),
  acceptedMimeTypes: z.array(z.string()).optional()
});
export type ProviderArtifactCapabilities = z.infer<typeof ProviderArtifactCapabilitiesSchema>;

export const AgentProviderProfileSchema = z.object({
  id: z.string().min(1),
  kind: AgentProviderKindSchema,
  displayName: z.string().min(1),
  capabilities: z.array(AgentProviderCapabilitySchema),
  authMode: AgentProviderAuthModeSchema,
  status: AgentProviderStatusSchema,
  artifactCapabilities: ProviderArtifactCapabilitiesSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});
export type AgentProviderProfile = z.infer<typeof AgentProviderProfileSchema>;

export const AgentSessionStatusSchema = z.enum(["unknown", "active", "idle", "notLoaded", "unavailable", "archived"]);
export type AgentSessionStatus = z.infer<typeof AgentSessionStatusSchema>;

export const AgentSessionRefSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  providerKind: AgentProviderKindSchema,
  externalSessionId: z.string().min(1),
  title: z.string().optional(),
  repoPath: z.string().optional(),
  status: AgentSessionStatusSchema,
  createdAt: TimestampSchema.optional(),
  lastSeenAt: TimestampSchema,
  metadata: z.record(z.unknown()).default({})
});
export type AgentSessionRef = z.infer<typeof AgentSessionRefSchema>;

export const AgentTurnSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  sessionRefId: z.string().min(1),
  externalTurnId: z.string().optional(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  artifactIds: z.array(z.string()),
  createdAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});
export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export const AgentEventSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  sessionRefId: z.string().optional(),
  turnId: z.string().optional(),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  createdAt: TimestampSchema
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const ExecutorTaskRequestSchema = z.object({
  id: z.string().optional(),
  missionId: z.string().min(1),
  handoffCardId: z.string().optional(),
  sessionRefId: z.string().optional(),
  taskSpec: TaskSpecSchema,
  generatedPrompt: z.string().optional(),
  repoContext: RepoContextPackSchema.optional(),
  artifactBundleIds: z.array(z.string()).default([]),
  fileIds: z.array(z.string()).default([]),
  stagedFilePaths: z.array(z.string()).default([]),
  includeFileSummaries: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({})
});
export type ExecutorTaskRequest = z.input<typeof ExecutorTaskRequestSchema>;

export const ExecutorTaskResultSchema = z.object({
  id: z.string().optional(),
  providerId: z.string().min(1),
  sessionRef: AgentSessionRefSchema.optional(),
  turnId: z.string().optional(),
  deliveryMode: z.enum(["newSession", "existingSession", "dryRun"]),
  success: z.boolean(),
  warnings: z.array(z.string()).default([]),
  artifactIds: z.array(z.string()).default([]),
  createdAt: TimestampSchema,
  metadata: z.record(z.unknown()).default({})
});
export type ExecutorTaskResult = z.infer<typeof ExecutorTaskResultSchema>;

export const ExecutorTurnMonitorResultSchema = z.object({
  providerId: z.string().min(1),
  sessionRefId: z.string().optional(),
  turnId: z.string().optional(),
  status: z.enum(["running", "completed", "failed", "blocked", "unknown"]),
  eventCount: z.number().int().nonnegative(),
  needsApproval: z.boolean().default(false),
  artifactIds: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({})
});
export type ExecutorTurnMonitorResult = z.infer<typeof ExecutorTurnMonitorResultSchema>;

export const AutopilotPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mode: z.enum(["manual", "supervised", "autonomous"]),
  maxIterations: z.number().int().positive(),
  maxRuntimeMinutes: z.number().int().positive().optional(),
  allowPlannerTurnsWithoutApproval: z.boolean(),
  allowCodexTurnsWithoutApproval: z.boolean(),
  allowVerificationWithoutApproval: z.boolean(),
  allowShellCommands: z.enum(["never", "configuredOnly", "askEachTime"]),
  allowFileWrites: z.enum(["never", "repoOnly", "missionArtifactsOnly", "askEachTime"]),
  allowNetworkAccess: z.boolean(),
  allowProviderFileUpload: z.enum(["never", "askEachTime", "belowSizeLimit", "always"]).optional(),
  maxProviderUploadBytes: z.number().int().positive().optional(),
  allowStagedFilesToRepo: z.enum(["never", "askEachTime", "safeExtensionsOnly", "always"]).optional(),
  allowedFileExtensions: z.array(z.string()).optional(),
  blockedFilePatterns: z.array(z.string()).optional(),
  redactBeforeUpload: z.boolean().optional(),
  requireApprovalForBinaryFiles: z.boolean().optional(),
  workspaceStrategy: z.enum(["none", "branch", "gitWorktree"]).optional(),
  requireIsolationForParallelRuns: z.boolean().optional(),
  stopOnVerificationFailure: z.boolean(),
  stopOnRedactionFinding: z.boolean(),
  stopOnProviderWarning: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type AutopilotPolicy = z.infer<typeof AutopilotPolicySchema>;

export const AutopilotRunStatusSchema = z.enum([
  "idle",
  "planning",
  "executing",
  "verifying",
  "reviewing",
  "steering",
  "blocked",
  "passed",
  "failed",
  "cancelled"
]);
export type AutopilotRunStatus = z.infer<typeof AutopilotRunStatusSchema>;

export const AutopilotRunSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  policyId: z.string().min(1),
  status: AutopilotRunStatusSchema,
  iteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive(),
  currentStepId: z.string().optional(),
  startedAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  stopReason: z.string().optional(),
  pendingUserDecisionId: z.string().optional()
});
export type AutopilotRun = z.infer<typeof AutopilotRunSchema>;

export const AutopilotStepSchema = z.object({
  id: z.string().min(1),
  autopilotRunId: z.string().min(1),
  missionId: z.string().min(1),
  kind: z.enum([
    "plan",
    "createTaskSpec",
    "sendToExecutor",
    "monitorExecutor",
    "verify",
    "review",
    "createFollowUp",
    "steer",
    "requestApproval",
    "stop"
  ]),
  status: z.enum(["pending", "running", "completed", "failed", "blocked", "skipped"]),
  inputArtifactIds: z.array(z.string()),
  outputArtifactIds: z.array(z.string()),
  providerId: z.string().optional(),
  sessionRefId: z.string().optional(),
  turnId: z.string().optional(),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  metadata: z.record(z.unknown()).default({})
});
export type AutopilotStep = z.infer<typeof AutopilotStepSchema>;

export const UserDecisionSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  autopilotRunId: z.string().optional(),
  decisionType: z.enum(["approveAction", "approveCommand", "choosePath", "resolveAmbiguity", "continue", "stop"]),
  prompt: z.string().min(1),
  options: z.array(z.string()),
  selectedOption: z.string().optional(),
  status: z.enum(["pending", "resolved", "cancelled"]),
  createdAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional()
});
export type UserDecision = z.infer<typeof UserDecisionSchema>;

export interface ExecutorProvider {
  profile(): AgentProviderProfile;
  status(): Promise<AgentProviderProfile>;
  listSessions(filter?: { repoPath?: string; searchTerm?: string }): Promise<AgentSessionRef[]>;
  createSession(input?: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }): Promise<AgentSessionRef>;
  resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef>;
  sendTask(input: ExecutorTaskRequest): Promise<ExecutorTaskResult>;
  steerTurn?(sessionRef: AgentSessionRef, text: string, context?: { missionId?: string; turnId?: string }): Promise<AgentTurn>;
  monitorTurn?(sessionRef: AgentSessionRef, context?: { missionId?: string; turnId?: string }): Promise<ExecutorTurnMonitorResult>;
  prepareArtifactsForInput?(request: ExecutorTaskRequest, context?: Record<string, unknown>): Promise<Record<string, unknown>>;
  extractArtifactsFromResult?(result: ExecutorTaskResult, context?: Record<string, unknown>): Promise<string[]>;
  listProviderReturnedArtifacts?(turnId: string): Promise<Artifact[]>;
}

export interface ProviderRegistry {
  registerProvider(provider: ExecutorProvider): void;
  listProviderProfiles(): Promise<AgentProviderProfile[]>;
  getProviderProfile(providerId: string): Promise<AgentProviderProfile | undefined>;
  listSessions(providerId?: string): Promise<AgentSessionRef[]>;
}

export const RunStepSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  missionId: z.string().min(1),
  kind: z.enum(["planning", "taskSpec", "delivery", "verification", "review", "followUp"]),
  status: z.enum(["pending", "running", "passed", "failed", "skipped", "needs_review"]),
  title: z.string().min(1),
  details: z.record(z.unknown()),
  artifactIds: z.array(z.string()),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema
});
export type RunStep = z.infer<typeof RunStepSchema>;

export const RunSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "needs_review"]),
  stepIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});
export type Run = z.infer<typeof RunSchema>;

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().nonnegative(),
  backoffMs: z.number().int().nonnegative().optional(),
  retryOn: z.array(z.enum(["deliveryFailed", "verificationFailed", "targetUnavailable"]))
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const RouteDecisionSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  handoffCardId: z.string().optional(),
  selectedTargetId: z.string().min(1),
  reason: z.string(),
  retryPolicy: RetryPolicySchema.optional(),
  createdAt: TimestampSchema
});
export type RouteDecision = z.infer<typeof RouteDecisionSchema>;

export const DeliveryAttemptSchema = z.object({
  id: z.string().min(1),
  handoffId: z.string().min(1),
  missionId: z.string().optional(),
  handoffCardId: z.string().optional(),
  runId: z.string().optional(),
  targetId: z.string().min(1),
  strategy: z.enum([
    "codexAppServerTurnStart",
    "autoUiaOnly",
    "valuePattern",
    "dryRun"
  ]),
  success: z.boolean(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  targetMetadata: z.record(z.unknown()),
  attemptedAt: TimestampSchema
});
export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "targetBound",
    "deliveryAttempted",
    "deliverySucceeded",
    "deliveryFailed",
    "redactionWarningShown"
  ]),
  missionId: z.string().optional(),
  handoffCardId: z.string().optional(),
  runId: z.string().optional(),
  entityId: z.string().optional(),
  details: z.record(z.unknown()),
  createdAt: TimestampSchema
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: TimestampSchema
});
export type Setting = z.infer<typeof SettingSchema>;
