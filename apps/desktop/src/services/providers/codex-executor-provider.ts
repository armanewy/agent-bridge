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
  type ExecutorTaskResult
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexTargetService } from "../codex-target-service.js";
import type { CodexSessionService } from "../codex-session-service.js";
import type { CodexAppServerClient } from "../codex-app-server-client.js";

export const CODEX_EXECUTOR_PROVIDER_ID = "codex";

export class CodexExecutorProvider implements ExecutorProvider {
  constructor(
    private readonly store: LocalStore,
    private readonly codexSessionService: CodexSessionService,
    private readonly codexTargetService: CodexTargetService,
    private readonly appServerClient?: CodexAppServerClient,
    private readonly now: () => string = () => new Date().toISOString()
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
        "canSendMessage"
      ],
      authMode: "appServer",
      status: "unavailable",
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
    const available = codexTargets.length > 0 || appServerStatus.available;
    return {
      ...this.profile(),
      status: available ? "available" : "unavailable",
      metadata: {
        adapter: "codex-executor",
        deepLinkTargetCount: codexTargets.length,
        appServerAvailable: appServerStatus.available,
        appServerMessage: appServerStatus.message,
        fallbackAvailable: codexTargets.length > 0
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
    const session = input.sessionRefId
      ? await this.resolveSession(input.sessionRefId)
      : await this.createSession({
          title: input.taskSpec.title,
          ...(input.repoContext?.repoPath ? { repoPath: input.repoContext.repoPath } : {})
        });
    const repoPath = input.repoContext?.repoPath ?? session.repoPath;
    if (!repoPath) {
      throw new Error("Codex Executor requires a repo path.");
    }
    const target = await this.resolveCodexTarget(repoPath, session);
    const prompt = input.generatedPrompt ?? renderTaskSpecForTarget(input.taskSpec, target, input.repoContext);
    const artifactIds = await this.saveExecutorPromptArtifact(input, prompt, session);
    const result = await this.codexTargetService.deliver({
      target,
      prompt,
      dryRun: input.dryRun,
      missionId: input.missionId,
      handoffCardId: input.handoffCardId ?? `provider_card_${randomUUID()}`,
      handoffId: stringFromMetadata(input.metadata.handoffId) ?? `provider_handoff_${randomUUID()}`,
      ...(target.existingThreadId ? { codexThreadId: target.existingThreadId } : {}),
      codexOpenMode: target.openMode,
      codexIntegrationMode: target.integrationMode ?? "deepLink"
    });
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

    return {
      id: `executor_result_${randomUUID()}`,
      providerId: CODEX_EXECUTOR_PROVIDER_ID,
      sessionRef: session,
      turnId: turn.id,
      deliveryMode: executorDeliveryMode(result.deliveryMode, input.dryRun),
      success: result.success,
      warnings: result.warnings ?? [],
      artifactIds,
      createdAt: completedAt,
      metadata: {
        codexThreadId: result.codexThreadId,
        codexTurnId: result.codexTurnId,
        rawDeliveryMode: result.deliveryMode,
        deepLink: result.deepLink
      }
    };
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

function sessionSearchText(ref: CodexThreadRef): string {
  return [ref.threadId, ref.name, ref.repoPath].filter(Boolean).join(" ").toLowerCase();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function stringFromMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
