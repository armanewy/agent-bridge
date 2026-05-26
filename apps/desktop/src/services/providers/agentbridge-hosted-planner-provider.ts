import { randomUUID } from "node:crypto";
import {
  HostedPlannerCreateSessionResponseSchema,
  HostedPlannerMessageResponseSchema,
  HostedPlannerReviewResponseSchema,
  HostedPlannerTaskSpecResponseSchema,
  type AgentProviderProfile,
  type AgentSessionRef,
  type AgentTurn,
  type Artifact,
  type HostedPlannerCreateSessionResponse,
  type HostedPlannerMessageResponse,
  type HostedPlannerReviewResponse,
  type HostedPlannerTaskSpecResponse,
  type PlannerProvider,
  type PlannerRequest,
  type PlannerResponse,
  type ReviewRequest,
  type ReviewResult
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { AuthService } from "../auth-service.js";
import {
  assertPlannerPayloadAllowed,
  buildReviewInput,
  PlannerPayloadBuilder,
  plannerPayloadHasHighSeverityFinding,
  savePlannerPayloadSummaryArtifact,
  type PlannerPayloadBuildResult,
  type PlannerPayloadPurpose
} from "../planner-payload-builder.js";

export const AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID = "agentbridge-hosted-planner";

export interface HostedPlannerTransport {
  request<T>(path: string, input: { method: string; token: string; body?: unknown; baseUrl: string }): Promise<T>;
}

export interface AgentBridgeHostedPlannerProviderOptions {
  transport?: HostedPlannerTransport;
  payloadBuilder?: PlannerPayloadBuilder;
  now?: () => string;
}

export class AgentBridgeHostedPlannerProvider implements PlannerProvider {
  private readonly transport: HostedPlannerTransport;
  private readonly payloadBuilder: PlannerPayloadBuilder;
  private readonly now: () => string;

  constructor(
    private readonly store: LocalStore,
    private readonly authService: AuthService,
    options: AgentBridgeHostedPlannerProviderOptions = {}
  ) {
    this.transport = options.transport ?? new FetchHostedPlannerTransport();
    this.now = options.now ?? (() => new Date().toISOString());
    this.payloadBuilder = options.payloadBuilder ?? new PlannerPayloadBuilder(store, this.now);
  }

  profile(): AgentProviderProfile {
    return {
      id: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      kind: "planner",
      displayName: "AgentBridge Hosted Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "agentBridgeCloud",
      status: "needsAuth",
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
        mode: "hostedAgentBridge",
        repoFilesIncludedByDefault: false,
        apiKeyRequiredOnDesktop: false
      }
    };
  }

  async status(): Promise<AgentProviderProfile> {
    const auth = await this.authService.getAuthStatus();
    return {
      ...this.profile(),
      status: auth.signedIn ? "available" : auth.status === "unavailable" ? "unavailable" : "needsAuth",
      metadata: {
        ...this.profile().metadata,
        cloudBaseUrl: auth.cloudBaseUrl,
        authStatus: auth.status,
        ...(auth.user?.email ? { userEmail: auth.user.email } : {}),
        ...(auth.error ? { error: auth.error } : {})
      }
    };
  }

  async createSession(input: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {}): Promise<AgentSessionRef> {
    const { token, baseUrl } = await this.requireCloudAuth();
    const response = HostedPlannerCreateSessionResponseSchema.parse(
      await this.transport.request<HostedPlannerCreateSessionResponse>("/v1/planner/sessions", {
        method: "POST",
        token,
        baseUrl,
        body: {
          title: input.title,
          mode: "hostedAgentBridge",
          metadata: input.metadata ?? {}
        }
      })
    );
    const now = this.now();
    const session: AgentSessionRef = {
      id: `agent_session_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      providerKind: "planner",
      externalSessionId: response.sessionId,
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {
        mode: "hostedAgentBridge",
        cloudSessionId: response.sessionId,
        cloudCreatedAt: response.createdAt,
        ...response.metadata,
        ...(input.metadata ?? {})
      },
      ...(input.title ? { title: input.title } : {}),
      ...(input.repoPath ? { repoPath: input.repoPath } : {})
    };
    await this.store.saveAgentSession(session);
    await this.store.appendAgentEvent({
      id: `agent_event_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      type: "session.created",
      payload: { hostedPlanner: true, cloudSessionId: response.sessionId },
      createdAt: now
    });
    return session;
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    const resumed: AgentSessionRef = {
      ...sessionRef,
      status: "active",
      lastSeenAt: this.now()
    };
    await this.store.saveAgentSession(resumed);
    return resumed;
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string, context?: PlannerRequest): Promise<AgentTurn> {
    const userTurn = await this.saveUserTurn(sessionRef.id, message, context);
    const { token, baseUrl } = await this.requireCloudAuth();
    const planPayloadInput: Parameters<PlannerPayloadBuilder["buildPlannerRequestPayload"]>[2] = {
      prompt: message,
      ...(context?.contextArtifactIds ? { contextArtifactIds: context.contextArtifactIds } : {}),
      ...(context?.repoContext ? { repoContext: context.repoContext } : {}),
      ...(context?.metadata ? { metadata: context.metadata } : {})
    };
    const payloadResult = await this.preparePayload("plan", context?.missionId, planPayloadInput);
    const response = HostedPlannerMessageResponseSchema.parse(
      await this.transport.request<HostedPlannerMessageResponse>(
        `/v1/planner/sessions/${encodeURIComponent(sessionRef.externalSessionId)}/messages`,
        {
          method: "POST",
          token,
          baseUrl,
          body: {
            sessionId: sessionRef.externalSessionId,
            missionId: context?.missionId,
            payload: payloadResult.payload,
            policy: payloadResult.policyUsed,
            metadata: {
              source: context?.metadata?.source ?? "plannerMessage",
              localUserTurnId: userTurn.id,
              payloadSummaryArtifactId: payloadResult.summaryArtifactId
            }
          }
        }
      )
    );
    return this.saveAssistantTurn(sessionRef, response.content, {
      externalTurnId: response.turnId,
      title: "Hosted Planner response",
      ...(context?.missionId ? { missionId: context.missionId } : {}),
      metadata: {
        requestId: response.requestId,
        createdAt: response.createdAt,
        ...response.metadata
      }
    });
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    const session = await this.resolvePlannerSession(input.sessionRefId, {
      title: "Hosted Planner thread",
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    const assistantTurn = await this.sendMessage(session, input.prompt, input);
    return {
      id: `planner_response_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      turnId: assistantTurn.id,
      content: assistantTurn.content,
      artifactIds: assistantTurn.artifactIds,
      createdAt: assistantTurn.completedAt ?? assistantTurn.createdAt,
      metadata: {
        mode: "hostedAgentBridge",
        ...assistantTurn.metadata
      }
    };
  }

  async createTaskSpec(input: PlannerRequest): Promise<PlannerResponse> {
    const session = await this.resolvePlannerSession(input.sessionRefId, {
      title: "Hosted Planner task thread",
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    await this.saveUserTurn(session.id, input.prompt, input);
    const { token, baseUrl } = await this.requireCloudAuth();
    const taskSpecPayloadInput: Parameters<PlannerPayloadBuilder["buildPlannerRequestPayload"]>[2] = {
      prompt: input.prompt,
      ...(input.contextArtifactIds ? { contextArtifactIds: input.contextArtifactIds } : {}),
      ...(input.repoContext ? { repoContext: input.repoContext } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };
    const payloadResult = await this.preparePayload("taskSpec", input.missionId, taskSpecPayloadInput);
    const response = HostedPlannerTaskSpecResponseSchema.parse(
      await this.transport.request<HostedPlannerTaskSpecResponse>("/v1/planner/task-spec", {
        method: "POST",
        token,
        baseUrl,
        body: {
          sessionId: session.externalSessionId,
          missionId: input.missionId,
          payload: payloadResult.payload,
          policy: payloadResult.policyUsed,
          metadata: {
            ...(input.metadata ?? {}),
            payloadSummaryArtifactId: payloadResult.summaryArtifactId
          }
        }
      })
    );
    const content = JSON.stringify(response.taskSpec, null, 2);
    const assistantTurn = await this.saveAssistantTurn(session, content, {
      title: "Hosted Planner TaskSpec",
      ...(input.missionId ? { missionId: input.missionId } : {}),
      metadata: {
        requestId: response.requestId,
        createdAt: response.createdAt,
        taskSpecParsed: true,
        ...response.metadata
      }
    });
    return {
      id: `planner_response_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      turnId: assistantTurn.id,
      content,
      taskSpec: response.taskSpec,
      artifactIds: assistantTurn.artifactIds,
      createdAt: assistantTurn.completedAt ?? assistantTurn.createdAt,
      metadata: {
        mode: "hostedAgentBridge",
        requestId: response.requestId,
        ...response.metadata
      }
    };
  }

  async review(input: ReviewRequest): Promise<ReviewResult> {
    const session = await this.resolvePlannerSession(input.sessionRefId, {
      title: "Hosted Planner review thread",
      ...(input.metadata ? { metadata: input.metadata } : {})
    });
    const { token, baseUrl } = await this.requireCloudAuth();
    const payloadResult = await this.preparePayload("review", input.missionId, buildReviewInput(input));
    const response = HostedPlannerReviewResponseSchema.parse(
      await this.transport.request<HostedPlannerReviewResponse>("/v1/planner/review", {
        method: "POST",
        token,
        baseUrl,
        body: {
          sessionId: session.externalSessionId,
          missionId: input.missionId,
          payload: payloadResult.payload,
          policy: payloadResult.policyUsed,
          metadata: {
            ...(input.metadata ?? {}),
            payloadSummaryArtifactId: payloadResult.summaryArtifactId
          }
        }
      })
    );
    const content = response.reviewSummary;
    const assistantTurn = await this.saveAssistantTurn(session, content, {
      missionId: input.missionId,
      title: "Hosted Planner review",
      metadata: {
        requestId: response.requestId,
        createdAt: response.createdAt,
        statusSuggestion: response.statusSuggestion,
        ...response.metadata
      }
    });
    return {
      id: `review_result_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      turnId: assistantTurn.id,
      content,
      statusSuggestion: response.statusSuggestion,
      ...(response.followUpTaskSpec ? { followUpTaskSpec: response.followUpTaskSpec } : {}),
      artifactIds: assistantTurn.artifactIds,
      createdAt: assistantTurn.completedAt ?? assistantTurn.createdAt,
      metadata: {
        mode: "hostedAgentBridge",
        requestId: response.requestId,
        ...response.metadata
      }
    };
  }

  private async resolvePlannerSession(
    sessionRefId: string | undefined,
    fallback: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<AgentSessionRef> {
    if (!sessionRefId) {
      return this.createSession(fallback);
    }
    const session = await this.store.getAgentSession(sessionRefId);
    if (!session) {
      throw new Error(`Planner session ${sessionRefId} was not found.`);
    }
    return session;
  }

  private async saveUserTurn(sessionRefId: string, message: string, context?: PlannerRequest): Promise<AgentTurn> {
    const now = this.now();
    const artifactIds = context?.missionId ? [await this.saveTextArtifact(context.missionId, "Planner user message", message, "reviewNote", {
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      source: "hostedPlannerUserMessage"
    })] : [];
    const turn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId,
      role: "user",
      content: message,
      status: "completed",
      artifactIds,
      createdAt: now,
      completedAt: now,
      metadata: {
        source: context?.metadata?.source ?? "hostedPlannerUserMessage",
        payloadPolicy: "repo-minimal"
      }
    };
    await this.store.saveAgentTurn(turn);
    return turn;
  }

  private async saveAssistantTurn(
    sessionRef: AgentSessionRef,
    content: string,
    input: {
      externalTurnId?: string;
      missionId?: string;
      title: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AgentTurn> {
    const now = this.now();
    const artifactIds = input.missionId
      ? [await this.saveTextArtifact(input.missionId, input.title, content, "modelResponse", {
          providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
          payloadPolicy: "repo-minimal",
          ...(input.metadata ?? {})
        })]
      : [];
    const turn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: sessionRef.id,
      ...(input.externalTurnId ? { externalTurnId: input.externalTurnId } : {}),
      role: "assistant",
      content,
      status: "completed",
      artifactIds,
      createdAt: now,
      completedAt: now,
      metadata: {
        mode: "hostedAgentBridge",
        payloadPolicy: "repo-minimal",
        ...(input.metadata ?? {})
      }
    };
    await this.store.saveAgentTurn(turn);
    await this.store.saveAgentSession({
      ...sessionRef,
      status: "active",
      lastSeenAt: now
    });
    await this.store.appendAgentEvent({
      id: `agent_event_${randomUUID()}`,
      providerId: AGENTBRIDGE_HOSTED_PLANNER_PROVIDER_ID,
      sessionRefId: sessionRef.id,
      turnId: turn.id,
      type: "turn.completed",
      payload: {
        mode: "hostedAgentBridge",
        requestId: input.metadata?.requestId
      },
      createdAt: now
    });
    return turn;
  }

  private async saveTextArtifact(
    missionId: string,
    title: string,
    content: string,
    kind: Artifact["kind"],
    metadata: Record<string, unknown>
  ): Promise<string> {
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind,
      title,
      content,
      metadata,
      createdAt: this.now()
    };
    await this.store.saveArtifact(artifact);
    return artifact.id;
  }

  private async requireCloudAuth(): Promise<{ token: string; baseUrl: string }> {
    const status = await this.authService.getAuthStatus();
    if (!status.signedIn) {
      throw new Error("Sign in to AgentBridge before using the hosted Planner.");
    }
    const token = await this.authService.getAuthToken();
    if (!token) {
      throw new Error("AgentBridge Cloud token is missing.");
    }
    return { token, baseUrl: this.authService.getCloudBaseUrl() };
  }

  private async preparePayload(
    purpose: PlannerPayloadPurpose,
    missionId: string | undefined,
    input: Parameters<PlannerPayloadBuilder["buildPlannerRequestPayload"]>[2]
  ): Promise<PlannerPayloadBuildResult & { summaryArtifactId?: string }> {
    if (!missionId) {
      const fallback = await this.payloadBuilder.buildPlannerRequestPayload(undefined, purpose, input);
      assertPlannerPayloadAllowed(fallback);
      return fallback;
    }
    const result = await this.payloadBuilder.buildPlannerRequestPayload(missionId, purpose, input);
    const summaryArtifactId = await savePlannerPayloadSummaryArtifact(this.store, missionId, purpose, result, this.now);
    if (plannerPayloadHasHighSeverityFinding(result)) {
      await this.createRedactionDecisionIfAutopilotActive(missionId, result);
    }
    assertPlannerPayloadAllowed(result);
    return { ...result, summaryArtifactId };
  }

  private async createRedactionDecisionIfAutopilotActive(missionId: string, result: PlannerPayloadBuildResult): Promise<void> {
    const activeRun = (await this.store.listAutopilotRunsForMission(missionId)).find(
      (run) => !["passed", "failed", "cancelled"].includes(run.status)
    );
    if (!activeRun) {
      return;
    }
    await this.store.saveUserDecision({
      id: `decision_${randomUUID()}`,
      missionId,
      autopilotRunId: activeRun.id,
      decisionType: "approveAction",
      prompt: [
        "Hosted Planner payload contains high-severity redaction findings.",
        ...result.redactionFindings
          .filter((finding) => finding.severity === "high")
          .map((finding) => `- ${finding.kind}: ${finding.preview}`)
      ].join("\n"),
      options: ["Review payload", "Stop"],
      status: "pending",
      createdAt: this.now()
    });
  }
}

export class FetchHostedPlannerTransport implements HostedPlannerTransport {
  async request<T>(path: string, input: { method: string; token: string; body?: unknown; baseUrl: string }): Promise<T> {
    const response = await fetch(`${input.baseUrl.replace(/\/+$/, "")}${path}`, {
      method: input.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.token}`
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
    if (!response.ok) {
      throw new Error(`AgentBridge Cloud returned HTTP ${response.status}.`);
    }
    return await response.json() as T;
  }
}
