import { randomUUID } from "node:crypto";
import {
  createCodexDeepLinkTarget,
  renderTaskSpecForTarget,
  type AgentProviderProfile,
  type AgentSessionRef,
  type AgentTurn,
  type CodexDeepLinkTarget,
  type CodexIntegrationMode,
  type CodexOpenMode,
  type CodexThreadRef,
  type ExecutorProvider,
  type ExecutorTaskRequest,
  type ExecutorTaskResult,
  type ExecutorTurnMonitorResult
} from "@agentbridge/core";
import { ExecutorTaskRequestSchema } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexTargetService } from "../codex-target-service.js";
import type { CodexSessionService } from "../codex-session-service.js";
import type { CodexAppServerClient } from "../codex-app-server-client.js";
import type { ArtifactBrokerService } from "../artifact-broker-service.js";

export const CODEX_EXECUTOR_PROVIDER_ID = "codex";

export interface CodexExecutorProviderOptions {
  platform?: string;
  canUseCodexDeepLinks?: boolean;
}

export class CodexExecutorProvider implements ExecutorProvider {
  constructor(
    private readonly store: LocalStore,
    private readonly codexSessionService: CodexSessionService,
    private readonly codexTargetService: CodexTargetService,
    private readonly appServerClient?: CodexAppServerClient,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly options: CodexExecutorProviderOptions = {},
    private readonly artifactBroker?: ArtifactBrokerService
  ) {}

  profile(): AgentProviderProfile {
    return {
      id: CODEX_EXECUTOR_PROVIDER_ID,
      kind: "executor",
      displayName: "Codex",
      capabilities: [
        "canExecuteCode",
        "canUseRepo",
        "canListSessions",
        "canCreateSession",
        "canResumeSession",
        "canSendMessage",
        "canStreamEvents"
      ],
      authMode: "appServer",
      status: "unavailable",
      artifactCapabilities: {
        canAcceptTextArtifacts: true,
        canAcceptFileInputs: false,
        canAcceptFilePaths: true,
        canReturnTextArtifacts: true,
        canReturnFileArtifacts: false,
        canReturnDiffs: true,
        canReturnLogs: true,
        canReturnScreenshots: false,
        acceptedMimeTypes: ["text/plain", "text/markdown", "application/json"]
      },
      metadata: {
        adapter: "codex-executor",
        reason: "Status requires async Codex target and App Server checks."
      }
    };
  }

  async status(): Promise<AgentProviderProfile> {
    const [targets, appServerStatus] = await Promise.all([
      this.store.listTargets(),
      this.appServerClient?.healthCheck() ?? Promise.resolve({ available: false, message: "Codex App Server is not configured." })
    ]);
    const codexTargets = targets.filter((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink");
    const deepLinkFallbackAvailable = codexTargets.length > 0 && this.options.canUseCodexDeepLinks !== false;
    const available = deepLinkFallbackAvailable || appServerStatus.available;
    return {
      ...this.profile(),
      status: available ? "available" : "unavailable",
      metadata: {
        adapter: "codex-executor",
        platform: this.options.platform ?? "unknown",
        deepLinkTargetCount: codexTargets.length,
        appServerAvailable: appServerStatus.available,
        appServerMessage: appServerStatus.message,
        fallbackAvailable: deepLinkFallbackAvailable,
        deepLinkFallbackAvailable,
        canUseCodexDeepLinks: this.options.canUseCodexDeepLinks !== false,
        canStreamEvents: appServerStatus.available
      }
    };
  }

  async listSessions(filter: { repoPath?: string; searchTerm?: string } = {}): Promise<AgentSessionRef[]> {
    const refs = await this.codexSessionService.listCodexThreads(filter.repoPath);
    return refs
      .filter((ref) => !filter.searchTerm || sessionSearchText(ref).includes(filter.searchTerm.toLowerCase()))
      .map((ref) => codexThreadRefToSession(ref, this.now()));
  }

  async createSession(input: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {}): Promise<AgentSessionRef> {
    const now = this.now();
    const session: AgentSessionRef = {
      id: `codex_session_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      providerKind: "executor",
      externalSessionId: `new_thread_${randomUUID()}`,
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {
        openMode: "newThread",
        integrationMode: "deepLink",
        deliveryMode: "newDeepLink",
        ...input.metadata
      },
      ...(input.title ? { title: input.title } : { title: "New Codex thread" }),
      ...(input.repoPath ? { repoPath: input.repoPath } : {})
    };
    await this.store.saveAgentSession(session);
    return session;
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    const now = this.now();
    const openMode = codexOpenModeFromSession(sessionRef);
    if (openMode === "existingThread" && codexIntegrationModeFromSession(sessionRef) === "appServer" && this.appServerClient) {
      await this.appServerClient.resumeThread(sessionRef.externalSessionId, sessionRef.repoPath ? { cwd: sessionRef.repoPath } : {});
    }
    const resumed: AgentSessionRef = {
      ...sessionRef,
      status: "active",
      lastSeenAt: now
    };
    await this.store.saveAgentSession(resumed);
    return resumed;
  }

  async sendTask(input: ExecutorTaskRequest): Promise<ExecutorTaskResult> {
    const request = ExecutorTaskRequestSchema.parse(input);
    const session = request.sessionRefId
      ? await this.resolveSession(request.sessionRefId)
      : await this.createSession({
          title: request.taskSpec.title,
          ...(request.repoContext?.repoPath ? { repoPath: request.repoContext.repoPath } : {})
        });
    const repoPath = request.repoContext?.repoPath ?? session.repoPath;
    if (!repoPath) {
      throw new Error("Codex Executor requires a repo path.");
    }
    const target = await this.resolveCodexTarget(repoPath, session);
    const preparedArtifacts = await this.prepareArtifactsForInput(request);
    const prompt = [
      request.generatedPrompt ?? renderTaskSpecForTarget(request.taskSpec, target, request.repoContext),
      renderCodexArtifactManifest(preparedArtifacts)
    ]
      .filter((section) => section.trim())
      .join("\n\n");
    const artifactIds = await this.saveExecutorPromptArtifact(request, prompt, session);
    await this.appendAgentEvent("turn.started", {
      sessionRefId: session.id,
      payload: {
        missionId: request.missionId,
        openMode: target.openMode,
        integrationMode: target.integrationMode ?? "deepLink",
        dryRun: request.dryRun,
        stagedFilePaths: preparedArtifacts.stagedFilePaths
      }
    });
    let result;
    try {
      result = await this.codexTargetService.deliver({
        target,
        prompt,
        dryRun: request.dryRun,
        missionId: request.missionId,
        handoffCardId: request.handoffCardId ?? `provider_card_${randomUUID()}`,
        handoffId: stringFromMetadata(request.metadata.handoffId) ?? `provider_handoff_${randomUUID()}`,
        ...(target.existingThreadId ? { codexThreadId: target.existingThreadId } : {}),
        codexOpenMode: target.openMode,
        codexIntegrationMode: target.integrationMode ?? "deepLink"
      });
    } catch (error) {
      await this.appendAgentEvent("turn.error", {
        sessionRefId: session.id,
        payload: {
          missionId: request.missionId,
          message: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
    const completedAt = this.now();
    const turn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      sessionRefId: session.id,
      ...(result.codexTurnId ? { externalTurnId: result.codexTurnId } : {}),
      role: "user",
      content: prompt,
      status: result.success ? "completed" : "failed",
      artifactIds,
      createdAt: completedAt,
      completedAt,
      metadata: {
        deliveryMode: result.deliveryMode,
        codexThreadId: result.codexThreadId,
        codexTurnId: result.codexTurnId,
        warnings: result.warnings ?? []
      }
    };
    await this.store.saveAgentTurn(turn);
    await this.store.saveAgentSession({
      ...session,
      status: "active",
      lastSeenAt: completedAt,
      metadata: {
        ...session.metadata,
        lastDeliveryMode: result.deliveryMode,
        ...(result.codexThreadId ? { codexThreadId: result.codexThreadId } : {}),
        ...(result.codexTurnId ? { codexTurnId: result.codexTurnId } : {})
      }
    });
    await this.appendAgentEvent(result.success ? "turn.completed" : "turn.failed", {
      sessionRefId: session.id,
      turnId: turn.id,
      payload: {
        missionId: request.missionId,
        deliveryMode: result.deliveryMode,
        codexThreadId: result.codexThreadId,
        codexTurnId: result.codexTurnId,
        warnings: result.warnings ?? []
      }
    });

    return {
      id: `executor_result_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      sessionRef: session,
      turnId: turn.id,
      deliveryMode: executorDeliveryMode(result.deliveryMode, request.dryRun),
      success: result.success,
      warnings: result.warnings ?? [],
      artifactIds,
      createdAt: completedAt,
      metadata: {
        codexThreadId: result.codexThreadId,
        codexTurnId: result.codexTurnId,
        rawDeliveryMode: result.deliveryMode,
        deepLink: result.deepLink,
        stagedFilePaths: preparedArtifacts.stagedFilePaths
      }
    };
  }

  async steerTurn(sessionRef: AgentSessionRef, text: string, context: { missionId?: string; turnId?: string } = {}): Promise<AgentTurn> {
    const session = (await this.store.getAgentSession(sessionRef.id)) ?? sessionRef;
    if (codexIntegrationModeFromSession(session) !== "appServer" || !this.appServerClient) {
      throw new Error("Codex steering requires an existing Codex App Server session.");
    }
    const startedAt = this.now();
    const requestedTurnId = context.turnId ?? stringFromMetadata(session.metadata.codexTurnId);
    const result = await this.appServerClient.steerTurn(session.externalSessionId, text, {
      ...(requestedTurnId ? { turnId: requestedTurnId } : {})
    });
    const completedAt = this.now();
    const turn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      sessionRefId: session.id,
      ...(result.turnId ? { externalTurnId: result.turnId } : {}),
      role: "user",
      content: text,
      status: "completed",
      artifactIds: [],
      createdAt: startedAt,
      completedAt,
      metadata: {
        source: "autopilotSteering",
        codexThreadId: session.externalSessionId,
        codexTurnId: result.turnId,
        appServerMetadata: result.metadata
      }
    };
    await this.store.saveAgentTurn(turn);
    await this.store.saveAgentSession({
      ...session,
      status: "active",
      lastSeenAt: completedAt,
      metadata: {
        ...session.metadata,
        ...(result.turnId ? { codexTurnId: result.turnId } : {})
      }
    });
    await this.appendAgentEvent("turn.steer", {
      sessionRefId: session.id,
      turnId: turn.id,
      payload: {
        missionId: context.missionId,
        codexThreadId: session.externalSessionId,
        codexTurnId: result.turnId
      }
    });
    return turn;
  }

  async monitorTurn(sessionRef: AgentSessionRef, context: { missionId?: string; turnId?: string } = {}): Promise<ExecutorTurnMonitorResult> {
    const session = (await this.store.getAgentSession(sessionRef.id)) ?? sessionRef;
    const requestedTurnId = context.turnId ?? stringFromMetadata(session.metadata.codexTurnId);
    if (codexIntegrationModeFromSession(session) !== "appServer" || !this.appServerClient) {
      return {
        providerId: CODEX_EXECUTOR_PROVIDER_ID,
        sessionRefId: session.id,
        ...(requestedTurnId ? { turnId: requestedTurnId } : {}),
        status: "unknown",
        eventCount: 0,
        needsApproval: false,
        artifactIds: [],
        warnings: ["Codex App Server is not available; deep-link delivery cannot be observed."],
        metadata: { mode: "unobserved" }
      };
    }
    const events = await this.appServerClient.listThreadEvents(session.externalSessionId, requestedTurnId);
    for (const event of events) {
      await this.appendAgentEvent(event.type, {
        sessionRefId: session.id,
        payload: {
          missionId: context.missionId,
          codexThreadId: session.externalSessionId,
          codexTurnId: requestedTurnId,
          ...event.payload
        }
      });
    }
    const status = inferMonitorStatus(events);
    return {
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      sessionRefId: session.id,
      ...(requestedTurnId ? { turnId: requestedTurnId } : {}),
      status,
      eventCount: events.length,
      needsApproval: status === "blocked",
      artifactIds: [],
      warnings: [],
      metadata: { eventTypes: events.map((event) => event.type) }
    };
  }

  async prepareArtifactsForInput(request: ExecutorTaskRequest): Promise<Record<string, unknown>> {
    const parsed = ExecutorTaskRequestSchema.parse(request);
    const fileIds = await this.resolveRequestFileIds(parsed);
    const stagedFilePaths = [...parsed.stagedFilePaths];
    const manifestEntries: Array<Record<string, unknown>> = [];

    if (this.artifactBroker && fileIds.length) {
      const stagedFiles = await this.artifactBroker.stageFilesForMission(parsed.missionId, fileIds, "executorInput");
      for (const file of stagedFiles) {
        stagedFilePaths.push(file.stagedPath);
        manifestEntries.push({
          fileId: file.fileId,
          fileName: file.fileName,
          stagedPath: file.stagedPath,
          relativePath: file.relativePath,
          sha256: file.sha256,
          sizeBytes: file.sizeBytes,
          classification: file.classification
        });
      }
    } else {
      for (const fileId of fileIds) {
        const file = await this.store.getArtifactFile(fileId);
        if (file) {
          manifestEntries.push({
            fileId: file.id,
            fileName: file.fileName,
            localPath: file.localPath,
            sha256: file.sha256,
            sizeBytes: file.sizeBytes,
            classification: file.classification,
            staged: false
          });
        }
      }
    }

    return {
      fileIds,
      stagedFilePaths,
      manifestEntries
    };
  }

  private async resolveRequestFileIds(request: { fileIds: string[]; artifactBundleIds: string[] }): Promise<string[]> {
    const bundleFileIds: string[] = [];
    for (const bundleId of request.artifactBundleIds) {
      const bundle = await this.store.getArtifactBundle(bundleId);
      if (bundle) {
        bundleFileIds.push(...bundle.fileIds);
      }
    }
    return [...new Set([...request.fileIds, ...bundleFileIds])];
  }

  private async resolveSession(sessionRefId: string): Promise<AgentSessionRef> {
    const session = await this.store.getAgentSession(sessionRefId);
    if (!session) {
      throw new Error(`Codex session ${sessionRefId} was not found.`);
    }
    return session;
  }

  private async resolveCodexTarget(repoPath: string, session: AgentSessionRef): Promise<CodexDeepLinkTarget> {
    const openMode = codexOpenModeFromSession(session);
    const integrationMode = codexIntegrationModeFromSession(session);
    const threadId = openMode === "existingThread" ? session.externalSessionId : undefined;
    const targets = await this.store.listTargets();
    const existing = targets.find(
      (target): target is CodexDeepLinkTarget =>
        target.kind === "codexDeepLink" &&
        normalizePath(target.repoPath) === normalizePath(repoPath) &&
        target.openMode === openMode &&
        (!threadId || target.existingThreadId === threadId)
    );
    if (existing) {
      return existing;
    }
    const target = createCodexDeepLinkTarget({
      id: `target_codex_provider_${randomUUID()}`,
      repoPath,
      openMode,
      integrationMode,
      ...(threadId ? { existingThreadId: threadId } : {}),
      ...(session.title ? { existingThreadName: session.title } : {})
    });
    await this.store.saveTarget(target);
    return target;
  }

  private async saveExecutorPromptArtifact(
    input: ExecutorTaskRequest,
    prompt: string,
    session: AgentSessionRef
  ): Promise<string[]> {
    const artifact = {
      id: `artifact_${randomUUID()}`,
      missionId: input.missionId,
      ...(input.handoffCardId ? { handoffCardId: input.handoffCardId } : {}),
      kind: "generatedPrompt" as const,
      title: "Codex executor prompt",
      content: prompt,
      metadata: {
        providerId: CODEX_EXECUTOR_PROVIDER_ID,
        sessionRefId: session.id,
        externalSessionId: session.externalSessionId,
        openMode: codexOpenModeFromSession(session),
        integrationMode: codexIntegrationModeFromSession(session)
      },
      createdAt: this.now()
    };
    await this.store.saveArtifact(artifact);
    return [artifact.id];
  }

  private async appendAgentEvent(
    type: string,
    input: { sessionRefId?: string; turnId?: string; payload: Record<string, unknown> }
  ): Promise<void> {
    await this.store.appendAgentEvent({
      id: `agent_event_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      ...(input.sessionRefId ? { sessionRefId: input.sessionRefId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      type,
      payload: input.payload,
      createdAt: this.now()
    });
  }
}

function codexThreadRefToSession(ref: CodexThreadRef, now: string): AgentSessionRef {
  return {
    id: `codex_session_${ref.threadId}`,
    providerId: CODEX_EXECUTOR_PROVIDER_ID,
    providerKind: "executor",
    externalSessionId: ref.threadId,
    ...(ref.name ? { title: ref.name } : {}),
    ...(ref.repoPath ? { repoPath: ref.repoPath } : {}),
    status: agentSessionStatusFromCodex(ref.status),
    lastSeenAt: ref.lastSeenAt || now,
    metadata: {
      openMode: "existingThread",
      integrationMode: ref.source === "appServer" ? "appServer" : ref.source === "sdk" ? "sdk" : "deepLink",
      codexThreadSource: ref.source,
      codexThreadId: ref.threadId,
      ...ref.metadata
    }
  };
}

function agentSessionStatusFromCodex(status: CodexThreadRef["status"] | undefined): AgentSessionRef["status"] {
  return status === "systemError" ? "unavailable" : status ?? "unknown";
}

function codexOpenModeFromSession(session: AgentSessionRef): CodexOpenMode {
  return session.metadata.openMode === "existingThread" ? "existingThread" : "newThread";
}

function codexIntegrationModeFromSession(session: AgentSessionRef): CodexIntegrationMode {
  const value = session.metadata.integrationMode;
  return value === "appServer" || value === "sdk" || value === "deepLink" ? value : "deepLink";
}

function executorDeliveryMode(mode: unknown, dryRun: boolean): ExecutorTaskResult["deliveryMode"] {
  if (dryRun) {
    return "dryRun";
  }
  if (mode === "appServerTurnStart") {
    return "existingSession";
  }
  if (mode === "existingDeepLinkOpen") {
    return "openOnlyFallback";
  }
  return "newSession";
}

function renderCodexArtifactManifest(preparedArtifacts: Record<string, unknown>): string {
  const entries = Array.isArray(preparedArtifacts.manifestEntries) ? preparedArtifacts.manifestEntries : [];
  if (!entries.length) {
    return "";
  }
  const lines = [
    "AgentBridge staged artifacts:",
    "Inspect these files before deciding whether to copy or modify them. Do not assume they belong in the repo unless the task requires it."
  ];
  for (const entry of entries) {
    const record = entry as Record<string, unknown>;
    lines.push(
      [
        `- ${String(record.fileName ?? record.fileId ?? "artifact")}`,
        record.stagedPath ? `  stagedPath: ${String(record.stagedPath)}` : undefined,
        record.localPath ? `  localPath: ${String(record.localPath)}` : undefined,
        record.relativePath ? `  relativePath: ${String(record.relativePath)}` : undefined,
        record.classification ? `  classification: ${String(record.classification)}` : undefined,
        record.sha256 ? `  sha256: ${String(record.sha256)}` : undefined
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    );
  }
  return lines.join("\n");
}

function sessionSearchText(ref: CodexThreadRef): string {
  return [ref.threadId, ref.name, ref.repoPath].filter(Boolean).join(" ").toLowerCase();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function stringFromMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function inferMonitorStatus(events: Array<{ type: string; payload: Record<string, unknown> }>): ExecutorTurnMonitorResult["status"] {
  const haystack = events.map((event) => `${event.type} ${JSON.stringify(event.payload)}`).join("\n").toLowerCase();
  if (!events.length) {
    return "unknown";
  }
  if (haystack.includes("approval") || haystack.includes("user decision")) {
    return "blocked";
  }
  if (haystack.includes("error") || haystack.includes("failed")) {
    return "failed";
  }
  if (haystack.includes("completed") || haystack.includes("turn.done") || haystack.includes("done")) {
    return "completed";
  }
  return "running";
}
