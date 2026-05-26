import { randomUUID } from "node:crypto";
import {
  TaskSpecSchema,
  type AgentProviderProfile,
  type AgentSessionRef,
  type AgentTurn,
  type Artifact,
  type PlannerProvider,
  type PlannerRequest,
  type PlannerResponse,
  type ReviewRequest,
  type ReviewResult,
  type TaskSpec
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexAppServerClient } from "../codex-app-server-client.js";

export class CodexLocalPlannerProvider implements PlannerProvider {
  constructor(
    private readonly store: LocalStore,
    private readonly client: CodexAppServerClient,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  profile(): AgentProviderProfile {
    return {
      id: "codex-local-planner",
      kind: "planner",
      displayName: "Codex Local Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "appServer",
      status: "unavailable",
      artifactCapabilities: {
        canAcceptTextArtifacts: true,
        canAcceptFileInputs: false,
        canAcceptFilePaths: false,
        canReturnTextArtifacts: true,
        canReturnFileArtifacts: false,
        canReturnDiffs: false,
        canReturnLogs: false,
        canReturnScreenshots: false,
        acceptedMimeTypes: ["text/plain", "text/markdown", "application/json"]
      },
      metadata: {
        mode: "codexLocalPlanner",
        advanced: true,
        warning: "Planner and executor are both Codex; this avoids hosted planner but reduces cross-agent diversity."
      }
    };
  }

  async status(): Promise<AgentProviderProfile> {
    const health = await this.client.healthCheck();
    return {
      ...this.profile(),
      status: health.available ? "available" : "unavailable",
      metadata: {
        ...this.profile().metadata,
        ...(health.message ? { message: health.message } : {})
      }
    };
  }

  async createSession(input: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {}): Promise<AgentSessionRef> {
    const threads = await this.client.listLoadedThreads();
    const explicitThreadId = typeof input.metadata?.threadId === "string" ? input.metadata.threadId : undefined;
    const thread = explicitThreadId ? threads.find((item) => item.threadId === explicitThreadId) : threads[0];
    if (!thread) {
      throw new Error("Codex App Server has no loaded thread available for local planning.");
    }
    const now = this.now();
    return {
      id: `session_codex_local_planner_${thread.threadId}`,
      providerId: "codex-local-planner",
      providerKind: "planner",
      externalSessionId: thread.threadId,
      title: input.title ?? thread.name ?? "Codex local planner",
      ...(thread.cwd ?? input.repoPath ? { repoPath: thread.cwd ?? input.repoPath } : {}),
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {
        mode: "codexLocalPlanner",
        warning: "Planner and executor are both Codex; no-cloud mode reduces cross-agent diversity."
      }
    };
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    await this.client.resumeThread(sessionRef.externalSessionId, sessionRef.repoPath ? { cwd: sessionRef.repoPath } : {});
    const resumed = { ...sessionRef, status: "active" as const, lastSeenAt: this.now() };
    await this.store.saveAgentSession(resumed);
    return resumed;
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string, context?: PlannerRequest): Promise<AgentTurn> {
    const started = await this.client.startTurn(sessionRef.externalSessionId, localPlannerPrompt(message), sessionRef.repoPath ? { cwd: sessionRef.repoPath } : {});
    const turn: AgentTurn = {
      id: `turn_${randomUUID()}`,
      providerId: "codex-local-planner",
      sessionRefId: sessionRef.id,
      ...(started.turnId ? { externalTurnId: started.turnId } : {}),
      role: "user",
      content: message,
      status: "completed",
      artifactIds: [],
      createdAt: this.now(),
      completedAt: this.now(),
      metadata: {
        ...started.metadata,
        missionId: context?.missionId
      }
    };
    await this.store.saveAgentTurn(turn);
    return turn;
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    const session = input.sessionRefId
      ? await this.requireSession(input.sessionRefId)
      : await this.createSession({ title: "Codex local planner", ...(input.repoContext?.repoPath ? { repoPath: input.repoContext.repoPath } : {}) });
    const started = await this.client.startTurn(
      session.externalSessionId,
      localPlannerPrompt(input.prompt),
      session.repoPath ? { cwd: session.repoPath } : {}
    );
    const content = resultText(started.metadata) ?? "Codex local planner turn started. Review the planner thread for the full response.";
    const artifact = await this.saveResponseArtifact(input.missionId, "Codex local planner response", content, started.metadata);
    return {
      providerId: "codex-local-planner",
      sessionRefId: session.id,
      ...(started.turnId ? { turnId: started.turnId } : {}),
      content,
      artifactIds: artifact ? [artifact.id] : [],
      createdAt: this.now(),
      metadata: started.metadata
    };
  }

  async review(input: ReviewRequest): Promise<ReviewResult> {
    const session = input.sessionRefId
      ? await this.requireSession(input.sessionRefId)
      : await this.createSession({ title: "Codex local reviewer", ...(input.taskSpec ? { metadata: { taskTitle: input.taskSpec.title } } : {}) });
    const started = await this.client.startTurn(
      session.externalSessionId,
      localPlannerPrompt(`Review this result and output JSON when follow-up is needed.\n\n${input.verificationSummary ?? input.taskSpec.goal}`),
      session.repoPath ? { cwd: session.repoPath } : {}
    );
    const content = resultText(started.metadata) ?? "Codex local review turn started. Review the planner thread for the full response.";
    const artifact = await this.saveResponseArtifact(input.missionId, "Codex local planner review", content, started.metadata);
    return {
      providerId: "codex-local-planner",
      sessionRefId: session.id,
      ...(started.turnId ? { turnId: started.turnId } : {}),
      content,
      statusSuggestion: statusSuggestionFromText(content),
      artifactIds: artifact ? [artifact.id] : [],
      createdAt: this.now(),
      metadata: started.metadata
    };
  }

  async createTaskSpec(input: PlannerRequest): Promise<PlannerResponse & { taskSpec?: TaskSpec }> {
    const response = await this.plan({
      ...input,
      prompt: `${input.prompt}\n\nReturn a strict JSON TaskSpec with title, goal, background, instructions, requirements, constraints, nonGoals, acceptanceCriteria, suggestedFiles, verificationSteps, and expectedSummaryFormat.`
    });
    const taskSpec = parseTaskSpec(response.content);
    const { taskSpec: _ignoredTaskSpec, ...responseWithoutTaskSpec } = response;
    return {
      ...responseWithoutTaskSpec,
      ...(taskSpec ? { taskSpec } : {})
    };
  }

  private async requireSession(sessionRefId: string): Promise<AgentSessionRef> {
    const session = await this.store.getAgentSession(sessionRefId);
    if (!session) {
      throw new Error(`Agent session ${sessionRefId} was not found.`);
    }
    return session;
  }

  private async saveResponseArtifact(
    missionId: string | undefined,
    title: string,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Artifact | undefined> {
    if (!missionId) {
      return undefined;
    }
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind: "modelResponse",
      title,
      content,
      metadata: {
        ...metadata,
        providerId: "codex-local-planner",
        source: "codexLocalPlanner"
      },
      createdAt: this.now()
    };
    await this.store.saveArtifact(artifact);
    return artifact;
  }
}

function localPlannerPrompt(message: string): string {
  return [
    "You are AgentBridge Codex Local Planner.",
    "Plan and review only. Do not edit files, run commands, or modify the repo in this planner thread.",
    "Prefer structured TaskSpec or review JSON. Keep work scoped and verifiable.",
    "",
    message
  ].join("\n");
}

function resultText(metadata: Record<string, unknown>): string | undefined {
  for (const key of ["outputText", "content", "text", "message"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function parseTaskSpec(value: string): TaskSpec | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return TaskSpecSchema.parse(parsed);
  } catch {
    return undefined;
  }
}

function statusSuggestionFromText(value: string): ReviewResult["statusSuggestion"] {
  const lower = value.toLowerCase();
  if (lower.includes("follow") || lower.includes("retry")) {
    return "follow_up_needed";
  }
  if (lower.includes("pass")) {
    return "passed";
  }
  return "needs_review";
}
