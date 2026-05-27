import type { RepoContextPack, TaskSpec } from "./types.js";

export function renderTaskSpecForTarget(
  taskSpec: TaskSpec,
  repoContext?: RepoContextPack
): string {
  const sections = [
    ["Goal", taskSpec.goal],
    ["Background", taskSpec.background],
    repoContext ? ["Repo context", renderRepoContext(repoContext)] : undefined,
    ["Instructions", renderList(taskSpec.instructions)],
    ["Requirements", renderList(taskSpec.requirements)],
    ["Constraints", renderList(taskSpec.constraints)],
    ["Non-goals", renderList(taskSpec.nonGoals)],
    ["Acceptance criteria", renderList(taskSpec.acceptanceCriteria)],
    ["Suggested files", taskSpec.suggestedFiles.length > 0 ? renderList(taskSpec.suggestedFiles) : "- None specified."],
    ["Verification steps", renderList(taskSpec.verificationSteps)],
    ["Expected final response format", taskSpec.expectedSummaryFormat]
  ].filter(Boolean) as Array<[string, string]>;

  const prefix = "You are receiving an AgentBridge TaskSpec.";

  return [prefix, "", ...sections.flatMap(([title, body]) => [`${title}:`, body, ""])].join("\n").trim();
}

function renderRepoContext(context: RepoContextPack): string {
  return [
    `- Repo path: ${context.repoPath}`,
    context.repoName ? `- Repo name: ${context.repoName}` : undefined,
    context.currentBranch ? `- Branch: ${context.currentBranch}` : undefined,
    context.gitStatusSummary ? `- Git status: ${context.gitStatusSummary}` : undefined,
    context.changedFiles?.length ? `- Changed files: ${context.changedFiles.join(", ")}` : undefined,
    context.testCommand ? `- Test command: ${context.testCommand}` : undefined,
    context.lintCommand ? `- Lint command: ${context.lintCommand}` : undefined,
    context.typecheckCommand ? `- Typecheck command: ${context.typecheckCommand}` : undefined
  ].filter(Boolean).join("\n");
}

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.";
}
