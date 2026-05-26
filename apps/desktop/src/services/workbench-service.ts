import { randomUUID } from "node:crypto";
import {
  renderTaskSpecForTarget,
  TaskSpecSchema,
  type AgentSessionRef,
  type AgentTurn,
  type Artifact,
  type ExecutorProvider,
  type ExecutorTaskResult,
  type ExecutorTurnMonitorResult,
  type HandoffCard,
  type Mission,
  type PlannerProvider,
  type PlannerRequest,
  type PlannerResponse,
  type ReviewResult,
  type Run,
  type RunStep,
  type TaskSpec,
  type VerificationCommand
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { VerificationRunRequest, VerificationRunResponse } from "./bridge-contract.js";
import type { VerificationService } from "./verification-service.js";

export interface CreateWorkbenchMissionInput {
  title?: string;
  goal?: string;
  repoContext?: Mission["repoContext"];
  verificationCommands?: VerificationCommand[];
}

export class WorkbenchService {
  constructor(
    private readonly store: LocalStore,
    private readonly planner: PlannerProvider,
    private readonly executor: ExecutorProvider,
    private readonly verificationService: VerificationService,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async createWorkbenchMission(input: CreateWorkbenchMissionInput = {}): Promise<Mission> {
    const now = this.now();
    const mission: Mission = {
      id: `mission_${randomUUID()}`,
      title: input.title ?? "Workbench task",
      goal: input.goal ?? "Plan, execute, verify, and review an AI-agent task.",
      status: "draft",
      sourceIds: [`provider:${this.planner.profile().id}`],
      captureIds: [],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      ...(input.repoContext ? { repoContext: input.repoContext } : {}),
      verificationPlan: {
        commands: input.verificationCommands ?? [],
        manualChecklist: [],
        expectedArtifacts: ["taskSpec", "generatedPrompt", "verificationResult"]
      },
      createdAt: now,
      updatedAt: now
    };
    await this.store.saveMission(mission);
    await this.appendRunStep(mission.id, "planning", "Create workbench mission", "passed", []);
    return mission;
  }

  async sendUserMessageToPlanner(missionId: string, text: string): Promise<PlannerResponse> {
    const mission = await this.requireMission(missionId);
    const response = await this.planner.plan({
      missionId,
      prompt: text,
      contextArtifactIds: mission.artifactIds,
      ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
      metadata: { source: "workbenchPlanner" }
    });
    await this.store.saveMission({
      ...mission,
      status: "planned",
      artifactIds: unique([...mission.artifactIds, ...response.artifactIds]),
      updatedAt: this.now()
    });
    await this.appendRunStep(missionId, "planning", "Ask Planner", "passed", response.artifactIds);
    return response;
  }

  async createTaskSpecFromLatestPlannerTurn(missionId: string): Promise<HandoffCard> {
    const mission = await this.requireMission(missionId);
    const plannerArtifact = await this.latestArtifact(missionId, (artifact) => artifact.kind === "modelResponse");
    if (!plannerArtifact?.content) {
      throw new Error("No planner response artifact found for this mission.");
    }
    const taskSpecResponse = hasCreateTaskSpec(this.planner)
      ? await this.planner.createTaskSpec({
          missionId,
          prompt: plannerArtifact.content,
          contextArtifactIds: unique([...mission.artifactIds, plannerArtifact.id]),
          ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
          metadata: { source: "workbenchTaskSpec" }
        })
      : undefined;
    const taskSpec = taskSpecResponse?.taskSpec ?? taskSpecFromPlannerText(plannerArtifact.content, mission);
    const createdAt = this.now();
    const generatedFromArtifactId = taskSpecResponse?.artifactIds[0] ?? plannerArtifact.id;
    const taskArtifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind: "taskSpec",
      title: "TaskSpec",
      content: JSON.stringify(taskSpec, null, 2),
      metadata: { generatedFromArtifactId },
      createdAt
    };
    const generatedPrompt = renderTaskSpecForTarget(taskSpec, undefined, mission.repoContext);
    const promptArtifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind: "generatedPrompt",
      title: "Executor prompt",
      content: generatedPrompt,
      metadata: { generatedFromArtifactId: taskArtifact.id },
      createdAt
    };
    const card: HandoffCard = {
      id: `card_${randomUUID()}`,
      missionId,
      sourceId: `provider:${this.planner.profile().id}`,
      captureId: plannerArtifact.id,
      targetId: "provider:codex",
      recipe: "implementationBrief",
      taskSpec,
      generatedPrompt,
      ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: [taskArtifact.id, promptArtifact.id],
      createdAt,
      updatedAt: createdAt
    };
    await this.store.saveArtifact(taskArtifact);
    await this.store.saveArtifact(promptArtifact);
    await this.store.saveHandoffCard(card);
    await this.store.saveMission({
      ...mission,
      title: mission.title === "Workbench task" ? taskSpec.title : mission.title,
      goal: taskSpec.goal,
      status: "ready",
      handoffCardIds: unique([...mission.handoffCardIds, card.id]),
      artifactIds: unique([...mission.artifactIds, ...(taskSpecResponse?.artifactIds ?? []), taskArtifact.id, promptArtifact.id]),
      updatedAt: createdAt
    });
    await this.appendRunStep(missionId, "transform", "Generate TaskSpec", "passed", [
      ...(taskSpecResponse?.artifactIds ?? []),
      taskArtifact.id,
      promptArtifact.id
    ]);
    return card;
  }

  async sendTaskSpecToExecutor(missionId: string, executorProviderId = "codex", sessionRefId?: string): Promise<ExecutorTaskResult> {
    if (executorProviderId !== this.executor.profile().id) {
      throw new Error(`Executor provider ${executorProviderId} is not registered for this workbench.`);
    }
    const mission = await this.requireMission(missionId);
    const card = await this.latestHandoffCard(missionId, (item) => item.recipe !== "debuggingRequest");
    const result = await this.executor.sendTask({
      missionId,
      handoffCardId: card.id,
      ...(sessionRefId ? { sessionRefId } : {}),
      taskSpec: card.taskSpec,
      generatedPrompt: card.generatedPrompt,
      ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
      dryRun: false,
      metadata: { handoffId: `provider_handoff_${card.id}` }
    });
    const artifact = await this.saveResultArtifact(missionId, "Executor delivery result", result);
    const status = result.success && result.deliveryMode !== "openOnlyFallback" ? "delivered" : "needs_review";
    await this.store.saveMission({
      ...mission,
      status,
      artifactIds: unique([...mission.artifactIds, artifact.id, ...result.artifactIds]),
      updatedAt: this.now()
    });
    await this.appendRunStep(missionId, "delivery", "Send TaskSpec to Codex", result.success ? "passed" : "failed", [
      artifact.id,
      ...result.artifactIds
    ]);
    return result;
  }

  async runMissionVerification(missionId: string, input: Omit<VerificationRunRequest, "missionId"> = {}): Promise<VerificationRunResponse> {
    await this.store.updateMissionStatus(missionId, "verifying");
    return this.verificationService.runVerification({ missionId, ...input });
  }

  async sendVerificationToPlannerForReview(missionId: string): Promise<ReviewResult> {
    const mission = await this.requireMission(missionId);
    const card = await this.latestHandoffCard(missionId);
    const verificationResults = await this.store.listVerificationResultsForMission(missionId);
    const verificationResult = verificationResults[0];
    if (!verificationResult) {
      throw new Error("No verification result found for this mission.");
    }
    const artifacts = await this.store.listArtifactsForMission(missionId);
    const review = await this.planner.review({
      missionId,
      taskSpec: card.taskSpec,
      verificationResult,
      verificationSummary: buildPlannerReviewSummary(verificationResult.summary, artifacts),
      artifactIds: unique([...mission.artifactIds, ...verificationResult.artifactIds]),
      metadata: { source: "verificationReview" }
    });
    const status = review.statusSuggestion === "passed" ? "passed" : review.statusSuggestion === "follow_up_needed" ? "needs_review" : "needs_review";
    const current = await this.requireMission(missionId);
    await this.store.saveMission({
      ...current,
      status,
      artifactIds: unique([...current.artifactIds, ...review.artifactIds]),
      updatedAt: this.now()
    });
    await this.appendRunStep(missionId, "review", "Ask Planner to review verification", "passed", review.artifactIds);
    return review;
  }

  async createFollowUpFromPlannerReview(missionId: string): Promise<HandoffCard> {
    const mission = await this.requireMission(missionId);
    const reviewArtifact = await this.latestArtifact(missionId, (artifact) => artifact.kind === "modelResponse");
    if (!reviewArtifact?.content) {
      throw new Error("No planner review artifact found for this mission.");
    }
    const baseCard = await this.latestHandoffCard(missionId);
    const taskSpec = taskSpecFromPlannerText(reviewArtifact.content, mission, baseCard.taskSpec);
    const createdAt = this.now();
    const prompt = renderTaskSpecForTarget(taskSpec, undefined, mission.repoContext);
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind: "generatedPrompt",
      title: "Planner follow-up prompt",
      content: prompt,
      metadata: { generatedFromArtifactId: reviewArtifact.id },
      createdAt
    };
    const card: HandoffCard = {
      id: `card_${randomUUID()}`,
      missionId,
      sourceId: `provider:${this.planner.profile().id}`,
      captureId: reviewArtifact.id,
      targetId: "provider:codex",
      recipe: "debuggingRequest",
      taskSpec,
      generatedPrompt: prompt,
      ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: [artifact.id],
      createdAt,
      updatedAt: createdAt
    };
    await this.store.saveArtifact(artifact);
    await this.store.saveHandoffCard(card);
    await this.store.saveMission({
      ...mission,
      handoffCardIds: unique([...mission.handoffCardIds, card.id]),
      artifactIds: unique([...mission.artifactIds, artifact.id]),
      updatedAt: createdAt
    });
    await this.appendRunStep(missionId, "followUp", "Draft follow-up TaskSpec", "passed", [artifact.id]);
    return card;
  }

  async sendFollowUpToExecutor(missionId: string, sessionRefId?: string): Promise<ExecutorTaskResult> {
    const mission = await this.requireMission(missionId);
    const card = await this.latestHandoffCard(missionId, (item) => item.recipe === "debuggingRequest");
    const result = await this.executor.sendTask({
      missionId,
      handoffCardId: card.id,
      ...(sessionRefId ? { sessionRefId } : {}),
      taskSpec: card.taskSpec,
      generatedPrompt: card.generatedPrompt,
      ...(mission.repoContext ? { repoContext: mission.repoContext } : {}),
      dryRun: false,
      metadata: { handoffId: `provider_handoff_${card.id}`, followUp: true }
    });
    await this.appendRunStep(missionId, "followUp", "Send follow-up to Codex", result.success ? "passed" : "failed", result.artifactIds);
    return result;
  }

  async monitorExecutor(missionId: string): Promise<ExecutorTurnMonitorResult> {
    const mission = await this.requireMission(missionId);
    const session = await this.latestExecutorSession(mission);
    if (!session || !hasMonitorTurn(this.executor)) {
      const artifact = await this.saveResultArtifact(missionId, "Executor monitor result", {
        status: "unknown",
        warning: "Executor monitoring is not available for this delivery mode."
      }, "reviewNote");
      await this.appendRunStep(missionId, "delivery", "Monitor Codex", "needs_review", [artifact.id]);
      return {
        providerId: this.executor.profile().id,
        status: "unknown",
        eventCount: 0,
        needsApproval: false,
        artifactIds: [artifact.id],
        warnings: ["Executor monitoring is not available for this delivery mode."],
        metadata: {}
      };
    }
    const turns = await this.store.listAgentTurns(session.id);
    const latestTurn = [...turns].reverse().find((turn) => turn.providerId === this.executor.profile().id);
    const result = await this.executor.monitorTurn(session, {
      missionId,
      ...(latestTurn?.externalTurnId ? { turnId: latestTurn.externalTurnId } : {})
    });
    const artifact = await this.saveResultArtifact(missionId, "Executor monitor result", result, "reviewNote");
    await this.appendRunStep(
      missionId,
      "delivery",
      "Monitor Codex",
      result.status === "failed" ? "failed" : result.status === "blocked" ? "needs_review" : "passed",
      [artifact.id, ...result.artifactIds]
    );
    return { ...result, artifactIds: [artifact.id, ...result.artifactIds] };
  }

  async steerExecutor(missionId: string, text: string): Promise<{ artifactIds: string[]; turn?: AgentTurn }> {
    const mission = await this.requireMission(missionId);
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind: "reviewNote",
      title: "User steering note",
      content: text,
      metadata: { source: "autopilotSteering" },
      createdAt: this.now()
    };
    await this.store.saveArtifact(artifact);

    const session = await this.latestExecutorSession(mission);
    if (session && hasSteerTurn(this.executor)) {
      const turns = await this.store.listAgentTurns(session.id);
      const latestTurn = [...turns].reverse().find((turn) => turn.providerId === this.executor.profile().id);
      const turn = await this.executor.steerTurn(session, text, {
        missionId,
        ...(latestTurn?.externalTurnId ? { turnId: latestTurn.externalTurnId } : {})
      });
      await this.appendRunStep(missionId, "followUp", "Steer Codex", "passed", [artifact.id, ...turn.artifactIds]);
      return { artifactIds: [artifact.id, ...turn.artifactIds], turn };
    }

    await this.appendRunStep(missionId, "followUp", "Record steering note", "needs_review", [artifact.id]);
    return { artifactIds: [artifact.id] };
  }

  private async requireMission(missionId: string): Promise<Mission> {
    const mission = await this.store.getMission(missionId);
    if (!mission) {
      throw new Error(`Mission ${missionId} was not found.`);
    }
    return mission;
  }

  private async latestHandoffCard(missionId: string, predicate: (card: HandoffCard) => boolean = () => true): Promise<HandoffCard> {
    const card = (await this.store.listHandoffCardsForMission(missionId)).find(predicate);
    if (!card) {
      throw new Error("No TaskSpec handoff card found for this mission.");
    }
    return card;
  }

  private async latestArtifact(missionId: string, predicate: (artifact: Artifact) => boolean): Promise<Artifact | undefined> {
    return (await this.store.listArtifactsForMission(missionId)).find(predicate);
  }

  private async saveResultArtifact(
    missionId: string,
    title: string,
    result: unknown,
    kind: Artifact["kind"] = "deliveryResult"
  ): Promise<Artifact> {
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      kind,
      title,
      content: JSON.stringify(result, null, 2),
      metadata: { generatedBy: "workbench-service" },
      createdAt: this.now()
    };
    await this.store.saveArtifact(artifact);
    return artifact;
  }

  private async latestExecutorSession(mission: Mission): Promise<AgentSessionRef | undefined> {
    const sessions = await this.store.listAgentSessions(this.executor.profile().id);
    if (!mission.repoContext?.repoPath) {
      return sessions[0];
    }
    const repoPath = normalizePath(mission.repoContext.repoPath);
    return sessions.find((session) => session.repoPath && normalizePath(session.repoPath) === repoPath) ?? sessions[0];
  }

  private async appendRunStep(
    missionId: string,
    kind: RunStep["kind"],
    title: string,
    status: RunStep["status"],
    artifactIds: string[]
  ): Promise<void> {
    const run = await this.ensureRun(missionId);
    const now = this.now();
    const step: RunStep = {
      id: `step_${randomUUID()}`,
      runId: run.id,
      missionId,
      kind,
      status,
      title,
      details: {},
      artifactIds,
      startedAt: now,
      completedAt: now,
      createdAt: now
    };
    await this.store.appendRunStep(step);
    await this.store.saveRun({
      ...run,
      status: status === "failed" ? "failed" : "running",
      stepIds: unique([...run.stepIds, step.id]),
      artifactIds: unique([...run.artifactIds, ...artifactIds]),
      updatedAt: now
    });
  }

  private async ensureRun(missionId: string): Promise<Run> {
    const existing = (await this.store.listRunsForMission(missionId))[0];
    if (existing) {
      return existing;
    }
    const now = this.now();
    const run: Run = {
      id: `run_${randomUUID()}`,
      missionId,
      status: "running",
      stepIds: [],
      artifactIds: [],
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };
    await this.store.saveRun(run);
    const mission = await this.requireMission(missionId);
    await this.store.saveMission({
      ...mission,
      runIds: unique([...mission.runIds, run.id]),
      updatedAt: now
    });
    return run;
  }
}

function taskSpecFromPlannerText(content: string, mission: Mission, fallback?: TaskSpec): TaskSpec {
  const parsed = parseTaskSpec(content);
  if (parsed) {
    return parsed;
  }
  return {
    title: fallback?.title ?? firstLine(content) ?? mission.title,
    goal: fallback?.goal ?? mission.goal,
    background: content,
    instructions: fallback?.instructions ?? ["Use the planner guidance to make the requested change."],
    requirements: fallback?.requirements ?? ["Keep the change scoped and verifiable."],
    constraints: fallback?.constraints ?? ["Do not expand beyond the requested task."],
    nonGoals: fallback?.nonGoals ?? ["Do not add unrelated providers or automation."],
    acceptanceCriteria: fallback?.acceptanceCriteria ?? ["The implementation addresses the planner request."],
    suggestedFiles: fallback?.suggestedFiles ?? [],
    verificationSteps: fallback?.verificationSteps ?? mission.verificationPlan?.commands.map((command) => command.command) ?? [],
    expectedSummaryFormat: fallback?.expectedSummaryFormat ?? "Summary, verification, and remaining risk."
  };
}

function parseTaskSpec(content: string): TaskSpec | undefined {
  const candidates = [content, content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  for (const candidate of candidates) {
    try {
      const result = TaskSpecSchema.safeParse(JSON.parse(candidate) as unknown);
      if (result.success) {
        return result.data;
      }
    } catch {
      // Planner text can be plain prose. The fallback TaskSpec keeps the loop moving.
    }
  }
  return undefined;
}

function buildPlannerReviewSummary(summary: string, artifacts: Artifact[]): string {
  const gitDiff = artifacts.find((artifact) => artifact.kind === "gitDiff");
  const commandOutputs = artifacts.filter(
    (artifact) => artifact.kind === "testOutput" || artifact.kind === "lintOutput" || artifact.kind === "typecheckOutput"
  );
  const failedOutputs = commandOutputs.filter((artifact) => /exitCode:\s*(?!0\b)\d+/i.test(artifact.content ?? ""));
  return [
    summary,
    "",
    "Changed files summary:",
    excerpt(gitDiff?.content, 1200) ?? "No git diff artifact was captured.",
    "",
    "Failed command excerpts:",
    failedOutputs.length === 0
      ? "No failed command output artifacts were detected."
      : failedOutputs.map((artifact) => [`${artifact.title}:`, excerpt(artifact.content, 1400) ?? "No output."].join("\n")).join("\n\n")
  ].join("\n");
}

function excerpt(value: string | undefined, maxLength: number): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...[truncated]` : value;
}

function firstLine(content: string): string | undefined {
  const line = content.split(/\r?\n/).find((item) => item.trim())?.trim();
  if (!line) {
    return undefined;
  }
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function hasSteerTurn(provider: ExecutorProvider): provider is ExecutorProvider & Required<Pick<ExecutorProvider, "steerTurn">> {
  return typeof provider.steerTurn === "function";
}

function hasMonitorTurn(provider: ExecutorProvider): provider is ExecutorProvider & Required<Pick<ExecutorProvider, "monitorTurn">> {
  return typeof provider.monitorTurn === "function";
}

function hasCreateTaskSpec(provider: PlannerProvider): provider is PlannerProvider & {
  createTaskSpec(input: PlannerRequest): Promise<PlannerResponse>;
} {
  return typeof (provider as PlannerProvider & { createTaskSpec?: unknown }).createTaskSpec === "function";
}
