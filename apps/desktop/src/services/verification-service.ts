import { exec, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  Artifact,
  ArtifactKind,
  CommandResult,
  HandoffCard,
  Mission,
  Run,
  RunStep,
  TaskSpec,
  VerificationCommand,
  VerificationPlan,
  VerificationResult
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { VerificationRunRequest, VerificationRunResponse } from "./bridge-contract.js";

const execFileAsync = promisify(execFile);

export interface CommandExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type CommandRunner = (command: VerificationCommand, cwd: string) => Promise<CommandExecution>;

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
      const output = await this.commandRunner(command, command.cwd ?? mission.repoContext.repoPath);
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

    const step: RunStep = {
      id: `step_${randomUUID()}`,
      runId: run.id,
      missionId: mission.id,
      kind: "verification",
      status: resultStatus === "passed" ? "passed" : resultStatus === "failed" ? "failed" : "needs_review",
      title: "Run mission verification",
      details: { commandCount: commands.length, resultStatus },
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
      status: missionStatusForVerification(resultStatus),
      verificationPlan: plan,
      runIds: unique([...mission.runIds, run.id]),
      handoffCardIds: unique([...mission.handoffCardIds, ...(followUp ? [followUp.card.id] : [])]),
      artifactIds: unique([...mission.artifactIds, ...artifacts.map((artifact) => artifact.id)]),
      updatedAt: completedAt
    });

    return { run: completedRun, result, artifacts };
  }

  private async saveGitDiffArtifact(mission: Mission, runId: string): Promise<Artifact> {
    const createdAt = new Date().toISOString();
    const content = await readGitDiffSummary(mission.repoContext?.repoPath ?? "");
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId: mission.id,
      runId,
      kind: "gitDiff",
      title: "Git diff summary",
      content,
      metadata: {
        repoPath: mission.repoContext?.repoPath,
        changedFiles: mission.repoContext?.changedFiles ?? []
      },
      createdAt
    };
    await this.store.saveArtifact(artifact);
    return artifact;
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
        durationMs: output.durationMs
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

async function readGitDiffSummary(repoPath: string): Promise<string> {
  if (!repoPath) {
    return "No repository path configured.";
  }
  try {
    const [{ stdout: statOutput }, { stdout: nameOutput }] = await Promise.all([
      execFileAsync("git", ["-C", repoPath, "diff", "--stat"], { windowsHide: true }),
      execFileAsync("git", ["-C", repoPath, "diff", "--name-only"], { windowsHide: true })
    ]);
    return [
      "git diff --stat:",
      statOutput.trim() || "No unstaged diff.",
      "",
      "changed files:",
      nameOutput.trim() || "No changed files in diff."
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Git diff unavailable: ${message}`;
  }
}

async function runShellCommand(command: VerificationCommand, cwd: string): Promise<CommandExecution> {
  const started = Date.now();
  return new Promise((resolve) => {
    exec(command.command, { cwd, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        exitCode: exitCodeFromError(error),
        stdout,
        stderr,
        durationMs: Date.now() - started
      });
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
