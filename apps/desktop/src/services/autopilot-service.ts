import { randomUUID } from "node:crypto";
import { decideAutopilot, evaluateCompletionContract } from "@agentbridge/core";
import type {
  Artifact,
  AutopilotPolicy,
  AutopilotRun,
  AutopilotRunStatus,
  AutopilotStep,
  UserDecision
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { ArtifactBrokerService, FileRiskFinding } from "./artifact-broker-service.js";
import type { WorkbenchService } from "./workbench-service.js";
import type { WorktreeManagerService } from "./worktree-manager-service.js";

export interface AutopilotStatus {
  run?: AutopilotRun;
  steps: AutopilotStep[];
  pendingDecision?: UserDecision;
}

export class AutopilotService {
  private readonly artifactBroker: ArtifactBrokerService | undefined;
  private readonly now: () => string;

  constructor(
    private readonly store: LocalStore,
    private readonly workbenchService: WorkbenchService,
    artifactBrokerOrNow?: ArtifactBrokerService | (() => string),
    now?: () => string,
    private readonly worktreeManager?: WorktreeManagerService
  ) {
    this.artifactBroker = typeof artifactBrokerOrNow === "function" ? undefined : artifactBrokerOrNow;
    this.now = typeof artifactBrokerOrNow === "function" ? artifactBrokerOrNow : now ?? (() => new Date().toISOString());
  }

  async startAutopilot(missionId: string, policyId?: string): Promise<AutopilotStatus> {
    const policy = policyId ? await this.requirePolicy(policyId) : await this.ensureDefaultPolicy();
    const now = this.now();
    const run: AutopilotRun = {
      id: `autopilot_run_${randomUUID()}`,
      missionId,
      policyId: policy.id,
      status: "idle",
      iteration: 0,
      maxIterations: policy.maxIterations,
      startedAt: now,
      updatedAt: now
    };
    await this.store.saveAutopilotRun(run);
    const blocked = await this.prepareMissionWorkspace(run, policy);
    if (blocked) {
      return blocked;
    }
    return this.continueAutopilot(run.id);
  }

  async stopAutopilot(autopilotRunId: string): Promise<AutopilotStatus> {
    const run = await this.requireRun(autopilotRunId);
    await this.store.updateAutopilotRunStatus(run.id, "cancelled", {
      completedAt: this.now(),
      stopReason: "Stopped by user."
    });
    return this.statusForRunId(run.id);
  }

  async continueAutopilot(autopilotRunId: string): Promise<AutopilotStatus> {
    let run = await this.requireRun(autopilotRunId);
    if (isTerminalRunStatus(run.status)) {
      return this.statusForRunId(run.id);
    }
    const policy = await this.requirePolicy(run.policyId);
    while (run.iteration < run.maxIterations) {
      const action = await this.nextAction(run, policy);
      if (isStopAction(action)) {
        run = await this.updateRun(run.id, action.status, {
          completedAt: this.now(),
          stopReason: action.reason
        });
        return this.statusForRunId(run.id);
      }
      if (await this.requiresApproval(run, policy, action.kind)) {
        const decision = await this.createDecision(run, action.kind, action.approvalPrompt ?? "Approve the next autopilot action?");
        run = await this.updateRun(run.id, "blocked", {
          pendingUserDecisionId: decision.id,
          stopReason: "Waiting for user approval."
        });
        return this.statusForRunId(run.id);
      }
      const stepOutcome = await this.runStep(run, action.kind, action.title, action.execute);
      if (stepOutcome !== "completed") {
        return this.statusForRunId(run.id);
      }
      const latest = await this.requireRun(run.id);
      run = {
        ...latest,
        iteration: action.incrementsIteration ? latest.iteration + 1 : latest.iteration
      };
      await this.store.saveAutopilotRun({ ...run, updatedAt: this.now() });
    }
    await this.updateRun(run.id, "blocked", {
      completedAt: this.now(),
      stopReason: "Maximum autopilot iterations reached."
    });
    return this.statusForRunId(run.id);
  }

  async steerAutopilot(autopilotRunId: string, text: string): Promise<AutopilotStatus> {
    const run = await this.requireRun(autopilotRunId);
    await this.runStep(run, "steer", "Steer mission", async () => {
      if (hasSteerExecutor(this.workbenchService)) {
        const result = await this.workbenchService.steerExecutor(run.missionId, text);
        return result.artifactIds;
      }
      const artifact: Artifact = {
        id: `artifact_${randomUUID()}`,
        missionId: run.missionId,
        kind: "reviewNote",
        title: "User steering note",
        content: text,
        metadata: { source: "autopilotSteering" },
        createdAt: this.now()
      };
      await this.store.saveArtifact(artifact);
      return [artifact.id];
    });
    return this.statusForRunId(run.id);
  }

  async getAutopilotStatus(missionId: string): Promise<AutopilotStatus> {
    const run = (await this.store.listAutopilotRunsForMission(missionId))[0];
    if (!run) {
      return { steps: [] };
    }
    return this.statusForRunId(run.id);
  }

  async resolvePendingDecision(decisionId: string, selectedOption: string): Promise<AutopilotStatus> {
    const decision = await this.store.resolveUserDecision(decisionId, selectedOption);
    if (!decision?.autopilotRunId) {
      return { steps: [] };
    }
    if (/approve|continue/i.test(selectedOption)) {
      const run = await this.requireRun(decision.autopilotRunId);
      await this.store.saveArtifact({
        id: `artifact_${randomUUID()}`,
        missionId: run.missionId,
        kind: "reviewNote",
        title: "User decision",
        content: `${decision.prompt}\n\nSelected: ${selectedOption}`,
        metadata: {
          source: "userDecision",
          decisionId: decision.id,
          decisionType: decision.decisionType,
          approvedPrompt: decision.prompt,
          approvedRisk: /approve/i.test(selectedOption),
          approvedCompletionContract: /completion contract/i.test(decision.prompt) && /approve/i.test(selectedOption)
        },
        createdAt: this.now()
      });
      await this.store.updateAutopilotRunStatus(run.id, "idle", {
        pendingUserDecisionId: undefined,
        stopReason: undefined
      });
      return this.continueAutopilot(run.id);
    }
    await this.store.updateAutopilotRunStatus(decision.autopilotRunId, "cancelled", {
      completedAt: this.now(),
      stopReason: `User selected: ${selectedOption}`
    });
    return this.statusForRunId(decision.autopilotRunId);
  }

  private async nextAction(run: AutopilotRun, policy: AutopilotPolicy): Promise<AutopilotAction> {
    const mission = await this.store.getMission(run.missionId);
    if (!mission) {
      return { kind: "stop", status: "failed", reason: `Mission ${run.missionId} was not found.` };
    }
    const artifacts = await this.store.listArtifactsForMission(run.missionId);
    const cards = await this.store.listHandoffCardsForMission(run.missionId);
    const verificationResults = await this.store.listVerificationResultsForMission(run.missionId);
    const latestVerification = verificationResults[0];

    if (!artifacts.some((artifact) => artifact.kind === "modelResponse")) {
      return { kind: "stop", status: "blocked", reason: "Plan with ChatGPT before starting the mission." };
    }
    if (!cards.length) {
      return {
        kind: "createTaskSpec",
        title: "Create TaskSpec",
        execute: async () => {
          const card = await this.workbenchService.createTaskSpecFromLatestPlannerTurn(run.missionId);
          return card.artifactIds;
        }
      };
    }
    const latestContract = (await this.store.listCompletionContractsForMission(run.missionId))[0];
    const humanReviewApproved = artifacts.some(
      (artifact) => artifact.metadata.source === "userDecision" && artifact.metadata.approvedCompletionContract === true
    );
    if ((latestContract?.status === "invalid" || latestContract?.status === "needs_user_input") && !humanReviewApproved) {
      return {
        kind: "requestApproval",
        title: "Resolve completion contract",
        approvalPrompt: "The completion contract is not objectively verifiable yet. Add verification evidence or approve continuing under human review.",
        execute: async () => []
      };
    }
    const deliveryResultCount = artifacts.filter(
      (artifact) => artifact.kind === "deliveryResult" && artifact.title === "Executor delivery result"
    ).length;
    if (!deliveryResultCount) {
      const fileRiskFindings = await this.findMissionFileRiskFindings(run.missionId, policy);
      const riskApproved = artifacts.some((artifact) => artifact.metadata.source === "userDecision" && artifact.metadata.approvedRisk === true);
      if (fileRiskFindings.length && !riskApproved) {
        return {
          kind: "requestApproval",
          title: "Approve file transfer risk",
          approvalPrompt: [
            "Approve risky mission files before sending context to a provider?",
            ...fileRiskFindings.map((finding) => `- ${finding.severity}: ${finding.message}`)
          ].join("\n"),
          execute: async () => []
        };
      }
      return {
        kind: "sendToExecutor",
        title: "Send to Codex",
        approvalPrompt: "Send this TaskSpec to Codex?",
        execute: async () => {
          const result = await this.workbenchService.sendTaskSpecToExecutor(run.missionId);
          return result.artifactIds;
        }
      };
    }
    const monitorSteps = await this.store.listAutopilotSteps(run.id);
    const completedMonitorCount = monitorSteps.filter((step) => step.kind === "monitorExecutor" && step.status === "completed").length;
    if (completedMonitorCount < deliveryResultCount) {
      return {
        kind: "monitorExecutor",
        title: "Monitor Codex",
        execute: async () => {
          if (hasMonitorExecutor(this.workbenchService)) {
            const result = await this.workbenchService.monitorExecutor(run.missionId);
            return result.artifactIds;
          }
          return [];
        }
      };
    }
    if (!latestVerification) {
      if (policy.allowShellCommands === "never") {
        return {
          kind: "stop",
          status: "blocked",
          reason: "Verification requires shell commands, but this policy forbids shell commands."
        };
      }
      return {
        kind: "verify",
        title: "Run verification",
        execute: async () => {
          const result = await this.workbenchService.runMissionVerification(run.missionId);
          return result.result.artifactIds;
        }
      };
    }
    const contract = (await this.store.listCompletionContractsForMission(run.missionId))[0];
    const completionEvaluation = contract
      ? evaluateCompletionContract(contract, await this.store.listCompletionEvidenceForContract(contract.id), this.now())
      : undefined;
    const decision = decideAutopilot({
      ...(completionEvaluation ? { completionEvaluation } : {}),
      iteration: run.iteration,
      maxIterations: run.maxIterations,
      ...(await this.buildLoopSignals(run.missionId))
    });
    if (decision.kind === "stopBlocked" || decision.kind === "stopFailed" || decision.kind === "askUser") {
      return { kind: "stop", status: "blocked", reason: decision.reason };
    }
    if (latestVerification.status === "passed") {
      if (decision.kind === "stopPassed") {
        return { kind: "stop", status: "passed", reason: decision.reason };
      }
      if (decision.kind === "retryWithFollowUp") {
        return { kind: "stop", status: "blocked", reason: "Review is manual in the ChatGPT-first flow." };
      }
      return { kind: "stop", status: "passed", reason: "Verification passed." };
    }
    if (!artifacts.some((artifact) => artifact.kind === "modelResponse" && artifact.metadata.source === "verificationReview")) {
      return { kind: "stop", status: "blocked", reason: "Review is manual in the ChatGPT-first flow." };
    }
    return {
      kind: "createFollowUp",
      title: "Create follow-up",
      incrementsIteration: true,
      execute: async () => {
        const card = await this.workbenchService.createFollowUpFromPlannerReview(run.missionId);
        return card.artifactIds;
      }
    };
  }

  private async buildLoopSignals(missionId: string): Promise<{
    repeatedFailureCount?: number;
    repeatedDiffCount?: number;
    noChangeTurnCount?: number;
    providerWarnings?: string[];
  }> {
    const [verificationResults, artifacts] = await Promise.all([
      this.store.listVerificationResultsForMission(missionId),
      this.store.listArtifactsForMission(missionId)
    ]);
    const failedResults = verificationResults.filter((result) => result.status === "failed");
    const latestFailure = failedResults[0];
    const repeatedFailureCount = latestFailure
      ? failedResults.filter((result) => normalizeSignal(result.summary) === normalizeSignal(latestFailure.summary)).length
      : 0;

    const gitDiffArtifacts = artifacts.filter((artifact) => artifact.kind === "gitDiff" && artifact.content);
    const latestDiff = gitDiffArtifacts[0]?.content;
    const repeatedDiffCount = latestDiff
      ? gitDiffArtifacts.filter((artifact) => artifact.content && normalizeSignal(artifact.content) === normalizeSignal(latestDiff)).length
      : 0;

    const noChangeTurnCount = gitDiffArtifacts.filter((artifact) => {
      const changedFiles = artifact.metadata.changedFiles;
      return Array.isArray(changedFiles) && changedFiles.length === 0;
    }).length;

    const providerWarnings = artifacts
      .filter((artifact) => artifact.kind === "deliveryResult")
      .flatMap((artifact) => extractDeliveryWarnings(artifact));

    return {
      ...(repeatedFailureCount ? { repeatedFailureCount } : {}),
      ...(repeatedDiffCount ? { repeatedDiffCount } : {}),
      ...(noChangeTurnCount ? { noChangeTurnCount } : {}),
      ...(providerWarnings.length ? { providerWarnings } : {})
    };
  }

  private async requiresApproval(run: AutopilotRun, policy: AutopilotPolicy, kind: AutopilotStep["kind"]): Promise<boolean> {
    if (run.pendingUserDecisionId) {
      return true;
    }
    if (kind === "sendToExecutor") {
      return !policy.allowCodexTurnsWithoutApproval && !(await this.hasApprovedPrompt(run.missionId, "Send this TaskSpec to Codex?"));
    }
    if (kind === "requestApproval") {
      return true;
    }
    if (kind === "verify") {
      return policy.allowShellCommands === "askEachTime" || !policy.allowVerificationWithoutApproval;
    }
    if (kind === "plan" || kind === "review" || kind === "createFollowUp") {
      return !policy.allowPlannerTurnsWithoutApproval;
    }
    return false;
  }

  private async hasApprovedPrompt(missionId: string, prompt: string): Promise<boolean> {
    const artifacts = await this.store.listArtifactsForMission(missionId);
    return artifacts.some(
      (artifact) =>
        artifact.metadata.source === "userDecision" &&
        artifact.metadata.approvedPrompt === prompt &&
        artifact.metadata.approvedRisk === true
    );
  }

  private async runStep(
    run: AutopilotRun,
    kind: AutopilotStep["kind"],
    title: string,
    execute?: () => Promise<string[]>
  ): Promise<AutopilotStepOutcome> {
    const startedAt = this.now();
    const step: AutopilotStep = {
      id: `autopilot_step_${randomUUID()}`,
      autopilotRunId: run.id,
      missionId: run.missionId,
      kind,
      status: "running",
      inputArtifactIds: [],
      outputArtifactIds: [],
      startedAt,
      metadata: { title }
    };
    await this.store.appendAutopilotStep(step);
    await this.updateRun(run.id, statusForStep(kind), { currentStepId: step.id });
    try {
      const outputArtifactIds = execute ? await execute() : [];
      await this.store.appendAutopilotStep({
        ...step,
        status: "completed",
        outputArtifactIds,
        completedAt: this.now()
      });
      return "completed";
    } catch (error) {
      const failure = classifyStepFailure(error);
      await this.store.appendAutopilotStep({
        ...step,
        status: failure.runStatus === "blocked" ? "blocked" : "failed",
        completedAt: this.now(),
        metadata: { title, error: failure.rawMessage, failureKind: failure.kind }
      });
      await this.updateRun(run.id, failure.runStatus, {
        completedAt: this.now(),
        stopReason: failure.reason
      });
      return failure.runStatus === "blocked" ? "blocked" : "failed";
    }
  }

  private async createDecision(run: AutopilotRun, kind: AutopilotStep["kind"], prompt: string): Promise<UserDecision> {
    const decision: UserDecision = {
      id: `decision_${randomUUID()}`,
      missionId: run.missionId,
      autopilotRunId: run.id,
      decisionType: kind === "verify" ? "approveCommand" : "approveAction",
      prompt,
      options: ["Approve", "Stop"],
      status: "pending",
      createdAt: this.now()
    };
    await this.store.saveUserDecision(decision);
    await this.runStep(run, "requestApproval", "Request approval", async () => []);
    return decision;
  }

  private async findMissionFileRiskFindings(missionId: string, policy: AutopilotPolicy): Promise<FileRiskFinding[]> {
    if (!this.artifactBroker) {
      return [];
    }
    const files = await this.store.listArtifactFilesForMission(missionId);
    const findings: FileRiskFinding[] = [];
    for (const file of files) {
      const scanOptions: {
        maxProviderUploadBytes?: number;
        allowedFileExtensions?: string[];
        blockedFilePatterns?: string[];
        requireApprovalForBinaryFiles?: boolean;
      } = {};
      if (policy.requireApprovalForBinaryFiles !== undefined) {
        scanOptions.requireApprovalForBinaryFiles = policy.requireApprovalForBinaryFiles;
      }
      if (policy.maxProviderUploadBytes !== undefined) {
        scanOptions.maxProviderUploadBytes = policy.maxProviderUploadBytes;
      }
      if (policy.allowedFileExtensions !== undefined) {
        scanOptions.allowedFileExtensions = policy.allowedFileExtensions;
      }
      if (policy.blockedFilePatterns !== undefined) {
        scanOptions.blockedFilePatterns = policy.blockedFilePatterns;
      }
      findings.push(
        ...(await this.artifactBroker.scanFileRisk(file.id, scanOptions))
      );
    }
    return findings.filter((finding) => finding.severity === "high" || policy.allowProviderFileUpload === "askEachTime");
  }

  private async prepareMissionWorkspace(run: AutopilotRun, policy: AutopilotPolicy): Promise<AutopilotStatus | undefined> {
    if (!this.worktreeManager) {
      return undefined;
    }
    const strategy = policy.workspaceStrategy ?? (policy.mode === "autonomous" ? "gitWorktree" : "none");
    if (strategy === "none") {
      return undefined;
    }
    if (policy.mode !== "autonomous" && !policy.requireIsolationForParallelRuns) {
      return undefined;
    }
    const mission = await this.store.getMission(run.missionId);
    if (!mission?.repoContext?.repoPath) {
      return undefined;
    }
    const existing = await this.worktreeManager.getMissionWorkspace(run.missionId);
    if (existing?.status === "active") {
      return undefined;
    }
    try {
      const workspace = await this.worktreeManager.createMissionWorkspace({
        missionId: run.missionId,
        baseRepoPath: mission.repoContext.repoPath,
        strategy,
        ...(mission.repoContext.currentBranch ? { baseBranch: mission.repoContext.currentBranch } : {})
      });
      await this.store.saveMission({
        ...mission,
        repoContext: {
          ...mission.repoContext,
          repoPath: workspace.workingPath,
          worktreePath: workspace.workingPath,
          ...(workspace.branchName ? { currentBranch: workspace.branchName } : {})
        },
        updatedAt: this.now()
      });
      return undefined;
    } catch (error) {
      const decision = await this.createDecision(run, "requestApproval", `Workspace isolation failed: ${error instanceof Error ? error.message : String(error)}`);
      await this.store.updateAutopilotRunStatus(run.id, "blocked", {
        pendingUserDecisionId: decision.id,
        stopReason: "Workspace isolation failed."
      });
      return this.statusForRunId(run.id);
    }
  }

  private async ensureDefaultPolicy(): Promise<AutopilotPolicy> {
    const existing = (await this.store.listAutopilotPolicies()).find((policy) => policy.name === "Supervised");
    if (existing) {
      return existing;
    }
    const now = this.now();
    const policy: AutopilotPolicy = {
      id: "policy_supervised_default",
      name: "Supervised",
      mode: "supervised",
      maxIterations: 3,
      allowPlannerTurnsWithoutApproval: true,
      allowCodexTurnsWithoutApproval: false,
      allowVerificationWithoutApproval: true,
      allowShellCommands: "configuredOnly",
      allowFileWrites: "repoOnly",
      allowNetworkAccess: false,
      allowProviderFileUpload: "askEachTime",
      maxProviderUploadBytes: 512 * 1024,
      allowStagedFilesToRepo: "askEachTime",
      blockedFilePatterns: ["(^|[/\\\\])\\.env$", "id_rsa", "private[-_]?key"],
      redactBeforeUpload: true,
      requireApprovalForBinaryFiles: true,
      workspaceStrategy: "gitWorktree",
      requireIsolationForParallelRuns: true,
      stopOnVerificationFailure: false,
      stopOnRedactionFinding: true,
      stopOnProviderWarning: true,
      createdAt: now,
      updatedAt: now
    };
    await this.store.saveAutopilotPolicy(policy);
    return policy;
  }

  private async requirePolicy(policyId: string): Promise<AutopilotPolicy> {
    const policy = await this.store.getAutopilotPolicy(policyId);
    if (!policy) {
      const defaultPolicy = this.defaultPolicyForId(policyId);
      if (defaultPolicy) {
        await this.store.saveAutopilotPolicy(defaultPolicy);
        return defaultPolicy;
      }
      throw new Error(`Autopilot policy ${policyId} was not found.`);
    }
    return policy;
  }

  private defaultPolicyForId(policyId: string): AutopilotPolicy | undefined {
    const now = this.now();
    if (policyId === "policy_manual_default") {
      return {
        ...basePolicy(policyId, "Manual", now),
        mode: "manual",
        allowPlannerTurnsWithoutApproval: false,
        allowCodexTurnsWithoutApproval: false,
        allowVerificationWithoutApproval: false
      };
    }
    if (policyId === "policy_autonomous_default") {
      return {
        ...basePolicy(policyId, "Autonomous", now),
        mode: "autonomous",
        allowPlannerTurnsWithoutApproval: true,
        allowCodexTurnsWithoutApproval: true,
        allowVerificationWithoutApproval: true
      };
    }
    if (policyId === "policy_supervised_default") {
      return {
        ...basePolicy(policyId, "Supervised", now),
        mode: "supervised"
      };
    }
    return undefined;
  }

  private async requireRun(runId: string): Promise<AutopilotRun> {
    const run = await this.store.getAutopilotRun(runId);
    if (!run) {
      throw new Error(`Autopilot run ${runId} was not found.`);
    }
    return run;
  }

  private async updateRun(runId: string, status: AutopilotRunStatus, patch: Partial<AutopilotRun> = {}): Promise<AutopilotRun> {
    const updated = await this.store.updateAutopilotRunStatus(runId, status, {
      ...patch,
      updatedAt: this.now()
    });
    if (!updated) {
      throw new Error(`Autopilot run ${runId} was not found.`);
    }
    return updated;
  }

  private async statusForRunId(runId: string): Promise<AutopilotStatus> {
    const run = await this.requireRun(runId);
    const steps = await this.store.listAutopilotSteps(run.id);
    const pendingDecision = run.pendingUserDecisionId
      ? await this.store.getUserDecision(run.pendingUserDecisionId)
      : undefined;
    return {
      run,
      steps,
      ...(pendingDecision ? { pendingDecision } : {})
    };
  }
}

type ExecutableAutopilotStepKind = Exclude<AutopilotStep["kind"], "stop">;
type AutopilotStepOutcome = "completed" | "blocked" | "failed";

interface AutopilotStepFailure {
  runStatus: Extract<AutopilotRunStatus, "blocked" | "failed">;
  kind: "providerUnavailable" | "executionFailed";
  reason: string;
  rawMessage: string;
}

interface ExecutableAutopilotAction {
  kind: ExecutableAutopilotStepKind;
  title: string;
  execute: () => Promise<string[]>;
  approvalPrompt?: string;
  incrementsIteration?: boolean;
}

interface StopAutopilotAction {
  kind: "stop";
  status: AutopilotRunStatus;
  reason: string;
}

type AutopilotAction = ExecutableAutopilotAction | StopAutopilotAction;

function isStopAction(action: AutopilotAction): action is StopAutopilotAction {
  return action.kind === "stop";
}

function isTerminalRunStatus(status: AutopilotRunStatus): boolean {
  return status === "cancelled" || status === "passed" || status === "failed";
}

function statusForStep(kind: AutopilotStep["kind"]): AutopilotRunStatus {
  if (kind === "plan" || kind === "createTaskSpec") {
    return "planning";
  }
  if (kind === "sendToExecutor" || kind === "monitorExecutor") {
    return "executing";
  }
  if (kind === "verify") {
    return "verifying";
  }
  if (kind === "review" || kind === "createFollowUp") {
    return "reviewing";
  }
  if (kind === "steer") {
    return "steering";
  }
  return "blocked";
}

function classifyStepFailure(error: unknown): AutopilotStepFailure {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalized = rawMessage.toLowerCase();
  const providerUnavailable =
    normalized.includes("codex app server") ||
    normalized.includes("provider unavailable") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused");

  if (providerUnavailable) {
    return {
      runStatus: "blocked",
      kind: "providerUnavailable",
      reason: `Provider is unavailable. ${rawMessage}`.trim(),
      rawMessage
    };
  }

  return {
    runStatus: "failed",
    kind: "executionFailed",
    reason: rawMessage,
    rawMessage
  };
}

function basePolicy(id: string, name: string, now: string): AutopilotPolicy {
  return {
    id,
    name,
    mode: "supervised",
    maxIterations: 3,
    allowPlannerTurnsWithoutApproval: true,
    allowCodexTurnsWithoutApproval: false,
    allowVerificationWithoutApproval: true,
    allowShellCommands: "configuredOnly",
    allowFileWrites: "repoOnly",
    allowNetworkAccess: false,
    allowProviderFileUpload: "askEachTime",
    maxProviderUploadBytes: 512 * 1024,
    allowStagedFilesToRepo: "askEachTime",
    blockedFilePatterns: ["(^|[/\\\\])\\.env$", "id_rsa", "private[-_]?key"],
    redactBeforeUpload: true,
    requireApprovalForBinaryFiles: true,
    workspaceStrategy: "gitWorktree",
    requireIsolationForParallelRuns: true,
    stopOnVerificationFailure: false,
    stopOnRedactionFinding: true,
    stopOnProviderWarning: true,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeSignal(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1600);
}

function extractDeliveryWarnings(artifact: Artifact): string[] {
  const metadataWarnings = artifact.metadata.warnings;
  if (Array.isArray(metadataWarnings)) {
    return metadataWarnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0);
  }
  if (!artifact.content) {
    return [];
  }
  try {
    const parsed = JSON.parse(artifact.content) as { warnings?: unknown };
    if (Array.isArray(parsed.warnings)) {
      return parsed.warnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0);
    }
  } catch {
    return /^warning[:\s]/i.test(artifact.content.trim()) ? [artifact.title] : [];
  }
  return [];
}

function hasSteerExecutor(value: WorkbenchService): value is WorkbenchService & {
  steerExecutor(missionId: string, text: string): Promise<{ artifactIds: string[] }>;
} {
  return typeof (value as { steerExecutor?: unknown }).steerExecutor === "function";
}

function hasMonitorExecutor(value: WorkbenchService): value is WorkbenchService & {
  monitorExecutor(missionId: string): Promise<{ artifactIds: string[] }>;
} {
  return typeof (value as { monitorExecutor?: unknown }).monitorExecutor === "function";
}
