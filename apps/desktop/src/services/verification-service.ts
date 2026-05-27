import { exec, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { evaluateCompletionContract } from "@agentbridge/core";
import type {
  Artifact,
  ArtifactKind,
  CommandResult,
  CompletionContract,
  CompletionEvidence,
  HandoffCard,
  Mission,
  MissionStatus,
  Run,
  RunStep,
  TaskSpec,
  VerificationCommand,
  VerificationPlan,
  VerificationResult
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { VerificationRunRequest, VerificationRunResponse } from "./bridge-contract.js";
import { PlatformService } from "./platform-service.js";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

export interface CommandExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  platform?: string;
  shell?: string;
  cwd?: string;
}

export type CommandRunner = (command: VerificationCommand, cwd: string) => Promise<CommandExecution>;

export class PlatformCommandRunner {
  constructor(
    private readonly platformService = new PlatformService(),
    private readonly timeoutMs = 10 * 60 * 1000,
    private readonly maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES
  ) {}

  run: CommandRunner = async (command, cwd) => runShellCommand(command, cwd, {
    shell: this.platformService.getDefaultShell(),
    platform: this.platformService.getPlatform(),
    timeoutMs: this.timeoutMs,
    maxBufferBytes: this.maxBufferBytes
  });
}

export class VerificationService {
  constructor(
    private readonly store: LocalStore,
    private readonly commandRunner: CommandRunner = runShellCommand
  ) {}

  async runVerification(input: VerificationRunRequest): Promise<VerificationRunResponse> {
    const mission = await this.store.getMission(input.missionId);
    if (!mission) {
      throw new Error("Mission not found.");
    }
    if (!mission.repoContext?.repoPath) {
      throw new Error("Mission does not have repo context.");
    }

    const now = new Date().toISOString();
    const commands = resolveCommands(mission, input.commands);
    const plan = createVerificationPlan(mission, commands);
    const run: Run = {
      id: `run_${randomUUID()}`,
      missionId: mission.id,
      status: "running",
      stepIds: [],
      artifactIds: [],
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };
    await this.store.saveRun(run);

    const artifacts: Artifact[] = [];
    const commandResults: CommandResult[] = [];
    artifacts.push(await this.saveGitDiffArtifact(mission, run.id));

    for (const command of commands) {
      const output = await this.commandRunner(command, resolveCommandCwd(command, mission.repoContext.repoPath));
      const artifact = await this.saveCommandArtifact(mission.id, run.id, command, output);
      artifacts.push(artifact);
      commandResults.push({
        kind: command.kind,
        command: command.command,
        exitCode: output.exitCode,
        status: output.exitCode === 0 ? "passed" : "failed",
        outputArtifactId: artifact.id,
        durationMs: output.durationMs
      });
    }

    const resultStatus = resolveVerificationStatus(commandResults, commands.length);
    const completedAt = new Date().toISOString();
    const summary = summarizeResult(commandResults, artifacts);
    artifacts.push(await this.saveSummaryArtifact(mission.id, run.id, summary));
    const followUp = resultStatus === "failed" ? await this.saveFollowUpDraft(mission, run.id, commandResults, summary, artifacts) : undefined;
    if (followUp) {
      artifacts.push(followUp.artifact);
    }

    const result: VerificationResult = {
      id: `verification_${randomUUID()}`,
      missionId: mission.id,
      runId: run.id,
      status: resultStatus,
      commandResults,
      summary,
      artifactIds: artifacts.map((artifact) => artifact.id),
      createdAt: completedAt
    };
    await this.store.saveVerificationResult(result);
    await this.saveCompletionEvidence(mission, result, artifacts, commandResults);
    const contractAwareStatus = await this.resolveContractAwareMissionStatus(mission.id, resultStatus);

    const step: RunStep = {
      id: `step_${randomUUID()}`,
      runId: run.id,
      missionId: mission.id,
      kind: "verification",
      status: resultStatus === "passed" ? "passed" : resultStatus === "failed" ? "failed" : "needs_review",
      title: "Run mission verification",
      details: { commandCount: commands.length, resultStatus, userApproved: true },
      artifactIds: artifacts.map((artifact) => artifact.id),
      startedAt: now,
      completedAt,
      createdAt: now
    };
    await this.store.appendRunStep(step);

    const completedRun: Run = {
      ...run,
      status: resultStatus === "passed" ? "completed" : resultStatus === "failed" ? "failed" : "needs_review",
      stepIds: [step.id],
      artifactIds: artifacts.map((artifact) => artifact.id),
      completedAt,
      updatedAt: completedAt
    };
    await this.store.saveRun(completedRun);
    await this.store.saveMission({
      ...mission,
      status: contractAwareStatus,
      verificationPlan: plan,
      runIds: unique([...mission.runIds, run.id]),
      handoffCardIds: unique([...mission.handoffCardIds, ...(followUp ? [followUp.card.id] : [])]),
      artifactIds: unique([...mission.artifactIds, ...artifacts.map((artifact) => artifact.id)]),
      updatedAt: completedAt
    });

    return { run: completedRun, result, artifacts };
  }

  private async saveCompletionEvidence(
    mission: Mission,
    result: VerificationResult,
    artifacts: Artifact[],
    commandResults: CommandResult[]
  ): Promise<CompletionEvidence[]> {
    const contracts = await this.store.listCompletionContractsForMission(mission.id);
    const created: CompletionEvidence[] = [];
    for (const contract of contracts) {
      for (const criterion of contract.acceptanceCriteria) {
        const evidence = evidenceForCriterion(contract, criterion.id, criterion.verifierKind, result, artifacts, commandResults);
        await this.store.saveCompletionEvidence(evidence);
        created.push(evidence);
      }
    }
    return created;
  }

  private async resolveContractAwareMissionStatus(
    missionId: string,
    verificationStatus: VerificationResult["status"]
  ): Promise<MissionStatus> {
    const contracts = await this.store.listCompletionContractsForMission(missionId);
    if (contracts.length === 0) {
      return missionStatusForVerification(verificationStatus);
    }
    const statuses = await Promise.all(
      contracts.map(async (contract) => {
        const storedEvidence = await this.store.listCompletionEvidenceForContract(contract.id);
        return evaluateCompletionContract(contract, storedEvidence).status;
      })
    );
    if (statuses.some((status) => status === "failed")) {
      return "failed";
    }
    if (verificationStatus === "failed") {
      return "failed";
    }
    if (verificationStatus === "passed" && statuses.every((status) => status === "passed")) {
      return "passed";
    }
    return "needs_review";
  }

  private async saveGitDiffArtifact(mission: Mission, runId: string): Promise<Artifact> {
    const createdAt = new Date().toISOString();
    const workspace = (await this.store.listMissionWorkspaces(mission.id))[0];
    const content = await readGitDiffSummary(mission.repoContext?.repoPath ?? "", workspace?.baseBranch);
    const changedFiles = parseChangedFilesFromGitDiffSummary(content);
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId: mission.id,
      runId,
      kind: "gitDiff",
      title: "Git diff summary",
      content,
      metadata: {
        repoPath: mission.repoContext?.repoPath,
        changedFiles
      },
      createdAt
    };
    await this.store.saveArtifact(artifact);
    await this.saveFileOwnershipForChangedFiles(mission, changedFiles, createdAt);
    return artifact;
  }

  private async saveFileOwnershipForChangedFiles(mission: Mission, changedFiles: string[], now: string): Promise<void> {
    if (!changedFiles.length) {
      return;
    }
    const workspace = (await this.store.listMissionWorkspaces(mission.id))[0];
    if (!workspace) {
      return;
    }
    for (const relativePath of changedFiles) {
      await this.store.saveFileOwnership({
        id: `ownership_${mission.id}_${relativePath.replace(/[^a-zA-Z0-9_.-]+/g, "_")}`,
        missionId: mission.id,
        workspaceId: workspace.id,
        relativePath,
        status: "changed",
        firstSeenAt: now,
        updatedAt: now
      });
    }
    await this.store.saveMissionWorkspace({
      ...workspace,
      status: "dirty",
      updatedAt: now
    });
  }

  private async saveCommandArtifact(
    missionId: string,
    runId: string,
    command: VerificationCommand,
    output: CommandExecution
  ): Promise<Artifact> {
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      runId,
      kind: artifactKindForCommand(command.kind),
      title: `${command.kind} output`,
      content: formatCommandOutput(output),
      metadata: {
        command: command.command,
        exitCode: output.exitCode,
        durationMs: output.durationMs,
        platform: output.platform,
        shell: output.shell,
        cwd: output.cwd
      },
      createdAt: new Date().toISOString()
    };
    await this.store.saveArtifact(artifact);
    return artifact;
  }

  private async saveSummaryArtifact(missionId: string, runId: string, summary: string): Promise<Artifact> {
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId,
      runId,
      kind: "reviewNote",
      title: "Verification summary",
      content: summary,
      metadata: { generatedBy: "verification-service" },
      createdAt: new Date().toISOString()
    };
    await this.store.saveArtifact(artifact);
    return artifact;
  }

  private async saveFollowUpDraft(
    mission: Mission,
    runId: string,
    commandResults: CommandResult[],
    summary: string,
    artifacts: Artifact[]
  ): Promise<{ card: HandoffCard; artifact: Artifact } | undefined> {
    const baseCard = (await this.store.listHandoffCardsForMission(mission.id))[0];
    if (!baseCard) {
      return undefined;
    }

    const taskSpec = createFollowUpTaskSpec(baseCard.taskSpec, commandResults, summary);
    const prompt = renderFollowUpPrompt(taskSpec, baseCard, commandResults, artifacts);
    const createdAt = new Date().toISOString();
    const repoContext = baseCard.repoContext ?? mission.repoContext;
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId: mission.id,
      runId,
      kind: "generatedPrompt",
      title: "Follow-up prompt draft",
      content: prompt,
      metadata: { draft: true, reason: "verificationFailed", baseHandoffCardId: baseCard.id },
      createdAt
    };
    await this.store.saveArtifact(artifact);

    const card: HandoffCard = {
      id: `card_${randomUUID()}`,
      missionId: mission.id,
      sourceId: baseCard.sourceId,
      captureId: baseCard.captureId,
      targetId: baseCard.targetId,
      recipe: "debuggingRequest",
      taskSpec,
      generatedPrompt: prompt,
      ...(repoContext ? { repoContext } : {}),
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: [artifact.id],
      createdAt,
      updatedAt: createdAt
    };
    await this.store.saveHandoffCard(card);
    return { card, artifact };
  }
}

export function resolveCommands(mission: Mission, explicitCommands: VerificationCommand[] = []): VerificationCommand[] {
  const repoPath = mission.repoContext?.repoPath;
  const fromPlan = mission.verificationPlan?.commands ?? [];
  const fromRepoContext: VerificationCommand[] = repoPath
    ? [
        ...(mission.repoContext?.testCommand ? [{ kind: "test" as const, command: mission.repoContext.testCommand, cwd: repoPath }] : []),
        ...(mission.repoContext?.lintCommand ? [{ kind: "lint" as const, command: mission.repoContext.lintCommand, cwd: repoPath }] : []),
        ...(mission.repoContext?.typecheckCommand
          ? [{ kind: "typecheck" as const, command: mission.repoContext.typecheckCommand, cwd: repoPath }]
          : [])
      ]
    : [];

  const seen = new Set<string>();
  return [...explicitCommands, ...fromPlan, ...fromRepoContext].filter((command) => {
    const key = `${command.kind}:${command.command}:${command.cwd ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createVerificationPlan(mission: Mission, commands: VerificationCommand[]): VerificationPlan {
  return {
    commands,
    manualChecklist: mission.verificationPlan?.manualChecklist ?? [],
    expectedArtifacts: ["gitDiff", ...commands.map((command) => artifactKindForCommand(command.kind))],
    ...(mission.verificationPlan?.acceptanceCriteriaRefs
      ? { acceptanceCriteriaRefs: mission.verificationPlan.acceptanceCriteriaRefs }
      : {})
  };
}

function resolveVerificationStatus(commandResults: CommandResult[], commandCount: number): VerificationResult["status"] {
  if (commandResults.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (commandCount === 0) {
    return "needs_review";
  }
  return "passed";
}

function missionStatusForVerification(status: VerificationResult["status"]): Mission["status"] {
  if (status === "passed" || status === "failed" || status === "needs_review") {
    return status;
  }
  return "needs_review";
}

function summarizeResult(commandResults: CommandResult[], artifacts: Artifact[]): string {
  const changedFiles = artifacts
    .flatMap((artifact) => (Array.isArray(artifact.metadata.changedFiles) ? artifact.metadata.changedFiles : []))
    .filter((item): item is string => typeof item === "string");
  const commandLines = commandResults.map(
    (result) => `- ${result.kind}: ${result.command} => ${result.status}${typeof result.exitCode === "number" ? ` (${result.exitCode})` : ""}`
  );
  const failed = commandResults.filter((result) => result.status === "failed");
  const statusLine =
    failed.length > 0 ? "Verification status: failed" : commandResults.length === 0 ? "Verification status: needs_review" : "Verification status: passed";
  return [
    statusLine,
    `Files changed: ${changedFiles.length === 0 ? "unknown or none" : changedFiles.join(", ")}`,
    "Commands run:",
    commandLines.length === 0 ? "- none configured" : commandLines.join("\n"),
    "Notable errors:",
    failed.length === 0 ? "- none detected" : failed.map((result) => `- ${result.kind}: ${result.command}`).join("\n"),
    "Acceptance criteria status: unknown without semantic review."
  ].join("\n");
}

function evidenceForCriterion(
  contract: CompletionContract,
  criterionId: string,
  kind: CompletionEvidence["kind"],
  result: VerificationResult,
  artifacts: Artifact[],
  commandResults: CommandResult[]
): CompletionEvidence {
  const createdAt = new Date().toISOString();
  const commandArtifactId = commandResults.find((item) => item.outputArtifactId)?.outputArtifactId;
  const summaryArtifactId = artifacts.find((artifact) => artifact.title === "Verification summary")?.id;
  const gitDiffArtifact = artifacts.find((artifact) => artifact.kind === "gitDiff");
  const screenshotArtifact = artifacts.find((artifact) => artifact.kind === "screenshot");
  const failedCommand = commandResults.find((item) => item.status === "failed");

  if (kind === "command") {
    if (failedCommand) {
      return {
        id: `evidence_${randomUUID()}`,
        contractId: contract.id,
        criterionId,
        ...(failedCommand.outputArtifactId ? { sourceArtifactId: failedCommand.outputArtifactId } : {}),
        kind,
        status: "failed",
        summary: `Command failed: ${failedCommand.command}`,
        createdAt
      };
    }
    if (commandResults.length > 0) {
      return {
        id: `evidence_${randomUUID()}`,
        contractId: contract.id,
        criterionId,
        ...(commandArtifactId ? { sourceArtifactId: commandArtifactId } : {}),
        kind,
        status: "passed",
        summary: "All configured verification commands passed.",
        createdAt
      };
    }
    return missingEvidence(contract.id, criterionId, kind, "No verification commands were configured.", createdAt);
  }

  if (kind === "gitDiff") {
    const content = gitDiffArtifact?.content ?? "";
    const hasDiff = !/No unstaged diff|No changed files in diff/i.test(content) && !/Git diff unavailable/i.test(content);
    return {
      id: `evidence_${randomUUID()}`,
      contractId: contract.id,
      criterionId,
      ...(gitDiffArtifact ? { sourceArtifactId: gitDiffArtifact.id } : {}),
      kind,
      status: hasDiff ? "passed" : "missing",
      summary: hasDiff ? "Git diff evidence exists." : "No git diff evidence exists.",
      createdAt
    };
  }

  if (kind === "visual") {
    return screenshotArtifact
      ? {
          id: `evidence_${randomUUID()}`,
          contractId: contract.id,
          criterionId,
          sourceArtifactId: screenshotArtifact.id,
          kind,
          status: "inconclusive",
          summary: "Visual artifact exists but still requires visual review.",
          createdAt
        }
      : missingEvidence(contract.id, criterionId, kind, "No screenshot or visual artifact was captured.", createdAt);
  }

  if (kind === "humanReview") {
    return missingEvidence(contract.id, criterionId, kind, "Human review is required.", createdAt);
  }

  if (result.status === "failed") {
    return {
      id: `evidence_${randomUUID()}`,
      contractId: contract.id,
      criterionId,
      ...(summaryArtifactId ? { sourceArtifactId: summaryArtifactId } : {}),
      kind,
      status: "failed",
      summary: "Verification failed.",
      createdAt
    };
  }
  if (result.status === "passed") {
    return {
      id: `evidence_${randomUUID()}`,
      contractId: contract.id,
      criterionId,
      ...(summaryArtifactId ? { sourceArtifactId: summaryArtifactId } : {}),
      kind,
      status: "passed",
      summary: "Verification summary indicates pass.",
      createdAt
    };
  }
  return missingEvidence(contract.id, criterionId, kind, "Verification was inconclusive.", createdAt);
}

function missingEvidence(
  contractId: string,
  criterionId: string,
  kind: CompletionEvidence["kind"],
  summary: string,
  createdAt: string
): CompletionEvidence {
  return {
    id: `evidence_${randomUUID()}`,
    contractId,
    criterionId,
    kind,
    status: "missing",
    summary,
    createdAt
  };
}

function createFollowUpTaskSpec(base: TaskSpec, commandResults: CommandResult[], summary: string): TaskSpec {
  const failed = commandResults.filter((result) => result.status === "failed");
  return {
    title: `Fix verification failures: ${base.title}`,
    goal: "Fix only the failed verification issue(s) from the previous run.",
    background: [base.background, "", "Verification summary:", summary].join("\n"),
    instructions: [
      "Inspect the failed command output artifacts before editing.",
      "Fix only the verification failure described in this follow-up.",
      "Preserve the original task constraints and non-goals."
    ],
    requirements: failed.map((result) => `Make ${result.kind} pass: ${result.command}`),
    constraints: base.constraints,
    nonGoals: unique([...base.nonGoals, "Do not expand scope beyond the failed verification result."]),
    acceptanceCriteria: failed.map((result) => `${result.kind} command passes: ${result.command}`),
    suggestedFiles: base.suggestedFiles,
    verificationSteps: failed.map((result) => `Run ${result.command}`),
    expectedSummaryFormat: base.expectedSummaryFormat
  };
}

function renderFollowUpPrompt(
  taskSpec: TaskSpec,
  baseCard: HandoffCard,
  commandResults: CommandResult[],
  artifacts: Artifact[]
): string {
  const failed = commandResults.filter((result) => result.status === "failed");
  return [
    "Goal",
    taskSpec.goal,
    "",
    "Background",
    taskSpec.background,
    "",
    "Requirements",
    ...taskSpec.requirements.map((item) => `- ${item}`),
    "",
    "Constraints",
    ...taskSpec.constraints.map((item) => `- ${item}`),
    "",
    "Non-goals",
    ...taskSpec.nonGoals.map((item) => `- ${item}`),
    "",
    "Failed command output excerpts",
    ...failed.map((result) => renderFailedCommand(result, artifacts)),
    "",
    "Original handoff card",
    baseCard.id,
    "",
    "Expected final response format",
    taskSpec.expectedSummaryFormat
  ].join("\n");
}

function renderFailedCommand(result: CommandResult, artifacts: Artifact[]): string {
  const artifact = result.outputArtifactId ? artifacts.find((item) => item.id === result.outputArtifactId) : undefined;
  const excerpt = artifact?.content?.slice(0, 2000) ?? "No output artifact found.";
  return [`- ${result.kind}: ${result.command}`, "```", excerpt, "```"].join("\n");
}

function artifactKindForCommand(kind: VerificationCommand["kind"]): ArtifactKind {
  if (kind === "test") {
    return "testOutput";
  }
  if (kind === "lint") {
    return "lintOutput";
  }
  if (kind === "typecheck") {
    return "typecheckOutput";
  }
  return "terminalLog";
}

function formatCommandOutput(output: CommandExecution): string {
  return [
    `exitCode: ${output.exitCode}`,
    `durationMs: ${output.durationMs}`,
    ...(output.platform ? [`platform: ${output.platform}`] : []),
    ...(output.shell ? [`shell: ${output.shell}`] : []),
    ...(output.cwd ? [`cwd: ${output.cwd}`] : []),
    "",
    "stdout:",
    output.stdout.trim(),
    "",
    "stderr:",
    output.stderr.trim()
  ].join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function resolveCommandCwd(command: VerificationCommand, repoPath: string): string {
  const resolvedRepoPath = resolve(repoPath);
  const resolvedCwd = resolve(command.cwd?.trim() || repoPath);
  const relativePath = relative(resolvedRepoPath, resolvedCwd);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return resolvedCwd;
  }
  throw new Error(`Verification command cwd must stay inside the mission repository: ${command.cwd}`);
}

async function readGitDiffSummary(repoPath: string, baseRef?: string): Promise<string> {
  if (!repoPath) {
    return "No repository path configured.";
  }
  try {
    const [
      { stdout: statusOutput },
      { stdout: unstagedStatOutput },
      { stdout: stagedStatOutput },
      { stdout: unstagedNameOutput },
      { stdout: stagedNameOutput },
      { stdout: untrackedNameOutput },
      committedDiff
    ] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "status", "--short"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--stat"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--cached", "--stat"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--name-only"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--cached", "--name-only"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "ls-files", "--others", "--exclude-standard"], { windowsHide: true }),
      readCommittedDiff(repoPath, baseRef)
    ]);
    const changedFiles = unique([
      ...splitLines(unstagedNameOutput),
      ...splitLines(stagedNameOutput),
      ...splitLines(untrackedNameOutput),
      ...committedDiff.changedFiles
    ]);
    return [
      "git status --short:",
      statusOutput.trim() || "Clean working tree.",
      "",
      "git diff --stat (unstaged):",
      unstagedStatOutput.trim() || "No unstaged diff.",
      "",
      "git diff --cached --stat (staged):",
      stagedStatOutput.trim() || "No staged diff.",
      "",
      "git diff --stat (committed since base):",
      committedDiff.stat.trim() || "No committed diff from base.",
      "",
      "changed files:",
      changedFiles.length ? changedFiles.join("\n") : "No changed files in diff."
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Git diff unavailable: ${message}`;
  }
}

async function readCommittedDiff(repoPath: string, baseRef?: string): Promise<{ stat: string; changedFiles: string[] }> {
  const verifiedBaseRef = await verifyGitRef(repoPath, baseRef);
  if (!verifiedBaseRef) {
    return { stat: "", changedFiles: [] };
  }
  try {
    const [{ stdout: stat }, { stdout: names }] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "diff", "--stat", `${verifiedBaseRef}...HEAD`], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--name-only", `${verifiedBaseRef}...HEAD`], { windowsHide: true })
    ]);
    return { stat, changedFiles: splitLines(names) };
  } catch {
    return { stat: "", changedFiles: [] };
  }
}

async function verifyGitRef(repoPath: string, ref?: string): Promise<string | undefined> {
  if (!ref?.trim()) {
    return undefined;
  }
  try {
    await execFileAsync("git", ["-C", repoPath, "rev-parse", "--verify", ref], { windowsHide: true });
    return ref;
  } catch {
    return undefined;
  }
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseChangedFilesFromGitDiffSummary(content: string): string[] {
  const marker = "changed files:";
  const index = content.toLowerCase().indexOf(marker);
  if (index < 0) {
    return [];
  }
  return content
    .slice(index + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^No changed files/i.test(line) && !/^Git diff unavailable/i.test(line));
}

async function runShellCommand(
  command: VerificationCommand,
  cwd: string,
  options: { shell?: string; platform?: string; timeoutMs?: number; maxBufferBytes?: number } = {}
): Promise<CommandExecution> {
  const started = Date.now();
  return new Promise((resolve) => {
    exec(command.command, {
      cwd,
      ...(options.shell ? { shell: options.shell } : {}),
      timeout: options.timeoutMs,
      windowsHide: true,
      maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
    }, (error, stdout, stderr) => {
      const output: CommandExecution = {
        exitCode: exitCodeFromError(error),
        stdout,
        stderr,
        durationMs: Date.now() - started,
        cwd
      };
      if (options.platform) {
        output.platform = options.platform;
      }
      if (options.shell) {
        output.shell = options.shell;
      }
      resolve(output);
    });
  });
}

function exitCodeFromError(error: unknown): number {
  if (!error) {
    return 0;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : 1;
}
