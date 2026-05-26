import { createHandoff } from "./handoff.js";
import type { Capture, Handoff, RepoContextPack, TargetEndpoint, TaskSpec, Transform } from "./types.js";
import { detectRedactions } from "./redaction.js";

export type TransformRecipe = Transform["recipe"];

export interface TransformRecipeDefinition {
  id: TransformRecipe;
  label: string;
  description: string;
}

export const transformRecipes: TransformRecipeDefinition[] = [
  {
    id: "rawRelay",
    label: "Raw relay",
    description: "Forward the capture with minimal formatting."
  },
  {
    id: "implementationBrief",
    label: "Implementation brief",
    description: "Turn the capture into a focused coding task."
  },
  {
    id: "codeReviewRequest",
    label: "Code review request",
    description: "Ask the target agent to review for bugs, risks, and missing tests."
  },
  {
    id: "debuggingRequest",
    label: "Debugging request",
    description: "Frame the capture as a debugging task with reproduction and verification prompts."
  }
];

export interface DeterministicTransformInput {
  id: string;
  missionId?: string;
  handoffCardId?: string;
  capture: Capture;
  targetId: string;
  target?: TargetEndpoint;
  recipe: TransformRecipe;
  repoContext?: RepoContextPack;
  createdAt?: string;
}

export function transformCapture(input: DeterministicTransformInput): Handoff {
  const taskSpec = createTaskSpecFromCapture({
    capture: input.capture,
    recipe: input.recipe
  });
  const prompt = renderTaskSpecForTarget(taskSpec, input.target, input.repoContext);
  const findings = detectRedactions(prompt);

  return createHandoff({
    id: input.id,
    ...(input.missionId ? { missionId: input.missionId } : {}),
    ...(input.handoffCardId ? { handoffCardId: input.handoffCardId } : {}),
    capture: input.capture,
    targetId: input.targetId,
    transformId: input.recipe,
    prompt,
    redactionFindings: findings,
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  });
}

export function buildPrompt(capture: Capture, recipe: TransformRecipe): string {
  return renderTaskSpecForTarget(createTaskSpecFromCapture({ capture, recipe }));
}

export interface CreateTaskSpecFromCaptureInput {
  capture: Capture;
  recipe: TransformRecipe;
}

export function createTaskSpecFromCapture(input: CreateTaskSpecFromCaptureInput): TaskSpec {
  const content = input.capture.text.trim();

  switch (input.recipe) {
    case "rawRelay":
      return {
        title: titleFromCapture(content, "Captured handoff"),
        goal: "Relay the captured content exactly enough for the target agent to act on it.",
        background: content,
        instructions: ["Use the captured content as the primary task context."],
        requirements: ["Preserve the user's intent from the capture."],
        constraints: ["Do not invent missing repository facts."],
        nonGoals: ["Do not broaden the scope beyond the captured request."],
        acceptanceCriteria: ["The target receives the approved content."],
        suggestedFiles: [],
        verificationSteps: ["Confirm delivery in AgentBridge audit history."],
        expectedSummaryFormat: "Briefly summarize what was done and any follow-up needed."
      };
    case "implementationBrief":
      return {
        title: titleFromCapture(content, "Implementation task"),
        goal: "Implement the requested change described in the captured context.",
        background: content,
        instructions: [
          "Inspect the repository before editing.",
          "Make the smallest coherent change that satisfies the request.",
          "Preserve existing architecture, naming, and test patterns."
        ],
        requirements: [
          "Implement the behavior requested by the capture.",
          "Add or update tests where practical.",
          "Report any blocker that prevents verification."
        ],
        constraints: [
          "Keep changes scoped to the requested task.",
          "Do not add provider integrations or broad refactors unless required.",
          "Do not discard user changes."
        ],
        nonGoals: ["Do not implement unrelated product ideas.", "Do not add cloud/team features."],
        acceptanceCriteria: [
          "The requested behavior is implemented.",
          "Relevant tests, lint, or typecheck commands pass, or blockers are reported.",
          "The final response summarizes files changed and verification."
        ],
        suggestedFiles: [],
        verificationSteps: ["Run the most relevant tests.", "Run typecheck or build if the touched area has one."],
        expectedSummaryFormat: "Summary, verification, risks or follow-ups."
      };
    case "codeReviewRequest":
      return {
        title: titleFromCapture(content, "Code review task"),
        goal: "Review the captured change or proposal for bugs, regressions, missing tests, and safety risks.",
        background: content,
        instructions: ["Prioritize actionable findings.", "Ground findings in concrete files, lines, or behaviors when available."],
        requirements: ["List findings before summary.", "Call out missing tests and behavioral regressions."],
        constraints: ["Do not rewrite the code unless explicitly asked.", "Do not include low-signal style nits."],
        nonGoals: ["Do not produce a general product critique."],
        acceptanceCriteria: ["Findings are ordered by severity.", "Residual risks or test gaps are explicit."],
        suggestedFiles: [],
        verificationSteps: ["Inspect relevant diffs or files before concluding."],
        expectedSummaryFormat: "Findings, open questions, brief summary."
      };
    case "debuggingRequest":
      return {
        title: titleFromCapture(content, "Debugging task"),
        goal: "Identify the likely failure, implement the smallest fix, and verify it.",
        background: content,
        instructions: ["Reproduce or reason through the failure first.", "Prefer a minimal, testable fix."],
        requirements: ["Explain the root cause.", "Add regression coverage where practical."],
        constraints: ["Do not mask the error with broad catch-all handling.", "Do not change unrelated behavior."],
        nonGoals: ["Do not perform broad cleanup while debugging."],
        acceptanceCriteria: ["The failure no longer reproduces.", "Verification output is captured or blockers are reported."],
        suggestedFiles: [],
        verificationSteps: ["Run the failing test or closest available command.", "Run a focused regression check."],
        expectedSummaryFormat: "Root cause, fix, verification, remaining risk."
      };
  }
}

export function renderTaskSpecForTarget(
  taskSpec: TaskSpec,
  target?: TargetEndpoint,
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

  const prefix = target?.kind === "codexDeepLink"
    ? "You are receiving an AgentBridge TaskSpec for Codex. Work in the linked local repository path."
    : "You are receiving an AgentBridge TaskSpec.";

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

function titleFromCapture(content: string, fallback: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (!firstLine) {
    return fallback;
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}
