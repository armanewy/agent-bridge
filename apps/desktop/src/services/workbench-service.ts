import { randomUUID } from "node:crypto";
import {
  renderTaskSpecForTarget,
  type AgentSessionRef,
  type AgentTurn,
  type Artifact,
  type ExecutorProvider,
  type ExecutorTaskResult,
  type ExecutorTurnMonitorResult,
  type HandoffCard,
  type Mission,
  type Run,
  type RunStep,
  type TaskSpec,
  type VerificationCommand,
  type WorkspaceCandidate
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { VerificationRunRequest, VerificationRunResponse } from "./bridge-contract.js";
import type { CompletionContractService } from "./completion-contract-service.js";
import type { VerificationService } from "./verification-service.js";
import type { WorkspaceResolverService } from "./workspace-resolver-service.js";
import { RepoContextService } from "./repo-context-service.js";
import { parseTaskSpecText } from "../shared/task-spec-import.js";

const CHATGPT_MANUAL_PROVIDER_ID = "chatgpt-manual";

export interface CreateWorkbenchMissionInput {
  title?: string;
  goal?: string;
  repoContext?: Mission["repoContext"];
  verificationCommands?: VerificationCommand[];
  importedPlannerResponse?: string;
}

export interface AttachWorkspaceInput {
  repoPath: string;
  repoName?: string;
  branch?: string;
  source?: WorkspaceCandidate["source"] | "userSelected";
}

export class WorkbenchService {
  private readonly repoContextService: RepoContextService;

  constructor(
    private readonly store: LocalStore,
    private readonly executor: ExecutorProvider,
    private readonly verificationService: VerificationService,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly workspaceResolver?: WorkspaceResolverService,
    private readonly completionContractService?: CompletionContractService
  ) {
    this.repoContextService = new RepoContextService(store);
  }

  async createWorkbenchMission(input: CreateWorkbenchMissionInput = {}): Promise<Mission> {
    const now = this.now();
    const mission: Mission = {
      id: `mission_${randomUUID()}`,
      title: input.title ?? "Workbench task",
      goal: input.goal ?? "Plan, execute, verify, and review an AI-agent task.",
      status: "draft",
      sourceIds: [`provider:${CHATGPT_MANUAL_PROVIDER_ID}`],
      captureIds: [],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      workflowTemplateId: "workflow_default_chatgpt_codex",
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
    let savedMission = input.repoContext ? mission : await this.attachHighConfidenceWorkspace(mission);
    if (input.importedPlannerResponse?.trim()) {
      const plannerArtifact: Artifact = {
        id: `artifact_${randomUUID()}`,
        missionId: savedMission.id,
        kind: "modelResponse",
        title: "Imported ChatGPT planner response",
        content: input.importedPlannerResponse.trim(),
        metadata: {
          providerId: "chatgpt-manual",
          source: "manualChatGptPlannerImport",
          imported: true
        },
        createdAt: now
      };
      await this.store.saveArtifact(plannerArtifact);
      savedMission = {
        ...savedMission,
        status: "planned",
        sourceIds: unique([...savedMission.sourceIds, "provider:chatgpt-manual"]),
        artifactIds: unique([...savedMission.artifactIds, plannerArtifact.id]),
        updatedAt: now
      };
      await this.store.saveMission(savedMission);
    }
    await this.appendRunStep(mission.id, "planning", "Create workbench mission", "passed", []);
    return savedMission;
  }

  async createTaskSpecFromLatestPlannerTurn(missionId: string): Promise<HandoffCard> {
    const mission = await this.requireMission(missionId);
    const plannerArtifact = await this.latestArtifact(missionId, (artifact) => artifact.kind === "modelResponse");
    if (!plannerArtifact?.content) {
      throw new Error("No planner response artifact found for this mission.");
    }
    const parsedPlannerTaskSpec = parseTaskSpecText(plannerArtifact.content);
    if (!parsedPlannerTaskSpec) {
      throw new Error("Selected ChatGPT plan is missing the expected headings. Plan with ChatGPT again, then use the selected plan.");
    }
    const taskSpec = parsedPlannerTaskSpec;
    const createdAt = this.now();
    const generatedFromArtifactId = plannerArtifact.id;
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
      sourceId: `provider:${CHATGPT_MANUAL_PROVIDER_ID}`,
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
    const completionContract = await this.completionContractService?.createFromTaskSpec(missionId, taskSpec);
    await this.store.saveMission({
      ...mission,
      title: mission.title === "Workbench task" ? taskSpec.title : mission.title,
      goal: taskSpec.goal,
      status: completionContract?.status === "invalid" || completionContract?.status === "needs_user_input" ? "needs_review" : "ready",
      handoffCardIds: unique([...mission.handoffCardIds, card.id]),
      artifactIds: unique([...mission.artifactIds, taskArtifact.id, promptArtifact.id]),
      updatedAt: createdAt
    });
    await this.appendRunStep(missionId, "transform", "Generate TaskSpec", "passed", [
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
    if (!sessionRefId && !mission.repoContext?.repoPath) {
      throw new Error("Choose workspace to create a new Codex thread.");
    }
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
    await this.appendRunStep(missionId, "delivery", "Send TaskSpec to Codex", result.success ? statusForExecutorDelivery(result) : "failed", [
      artifact.id,
      ...result.artifactIds
    ]);
    return result;
  }

  async runMissionVerification(missionId: string, input: Omit<VerificationRunRequest, "missionId"> = {}): Promise<VerificationRunResponse> {
    const mission = await this.requireMission(missionId);
    if (!mission.repoContext?.repoPath) {
      throw new Error("Choose workspace to run verification.");
    }
    await this.store.updateMissionStatus(missionId, "verifying");
    return this.verificationService.runVerification({ missionId, ...input });
  }

  async attachWorkspaceToMission(missionId: string, input: AttachWorkspaceInput): Promise<Mission> {
    const mission = await this.requireMission(missionId);
    if (!input.repoPath.trim()) {
      throw new Error("Workspace repo path is required.");
    }
    const repoContext = await this.repoContextService.build(input.repoPath);
    const updated: Mission = {
      ...mission,
      repoContext: {
        ...repoContext,
        ...(input.repoName ? { repoName: input.repoName } : {}),
        ...(input.branch ? { currentBranch: input.branch } : {})
      },
      updatedAt: this.now()
    };
    await this.store.saveMission(updated);
    await this.appendRunStep(missionId, "planning", "Attach workspace", "passed", []);
    return updated;
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
      sourceId: `provider:${CHATGPT_MANUAL_PROVIDER_ID}`,
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
    await this.appendRunStep(missionId, "followUp", "Send follow-up to Codex", result.success ? statusForExecutorDelivery(result) : "failed", result.artifactIds);
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

  private async attachHighConfidenceWorkspace(mission: Mission): Promise<Mission> {
    if (!this.workspaceResolver) {
      return mission;
    }
    const candidates = await this.workspaceResolver.inferForMission(mission.id);
    const best = this.workspaceResolver.getBestCandidate(candidates);
    if (!best?.repoPath || best.confidence < 90) {
      return mission;
    }
    const repoContext = await this.repoContextService.build(best.repoPath);
    const updated: Mission = {
      ...mission,
      repoContext: {
        ...repoContext,
        ...(best.repoName ? { repoName: best.repoName } : {}),
        ...(best.branch ? { currentBranch: best.branch } : {})
      },
      updatedAt: this.now()
    };
    await this.store.saveMission(updated);
    return updated;
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
  const parsed = parseTaskSpecText(content);
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

function statusForExecutorDelivery(result: ExecutorTaskResult): RunStep["status"] {
  return result.deliveryMode === "openOnlyFallback" ? "needs_review" : "passed";
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
