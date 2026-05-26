import { createHandoff } from "./handoff.js";
import type { Capture, Handoff, Transform } from "./types.js";
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
  capture: Capture;
  targetId: string;
  recipe: TransformRecipe;
  createdAt?: string;
}

export function transformCapture(input: DeterministicTransformInput): Handoff {
  const prompt = buildPrompt(input.capture, input.recipe);
  const findings = detectRedactions(prompt);

  return createHandoff({
    id: input.id,
    capture: input.capture,
    targetId: input.targetId,
    transformId: input.recipe,
    prompt,
    redactionFindings: findings,
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  });
}

export function buildPrompt(capture: Capture, recipe: TransformRecipe): string {
  const content = capture.text.trim();

  switch (recipe) {
    case "rawRelay":
      return content;
    case "implementationBrief":
      return [
        "Goal:",
        "Implement the requested change described in the captured context.",
        "",
        "Context:",
        content,
        "",
        "Constraints:",
        "- Keep the change scoped to the relevant files.",
        "- Preserve existing project patterns.",
        "- Add or update tests where practical.",
        "",
        "Acceptance criteria:",
        "- The requested behavior is implemented.",
        "- Relevant build and test commands pass or any blockers are reported."
      ].join("\n");
    case "codeReviewRequest":
      return [
        "Review request:",
        "Review the captured change or proposal for bugs, regressions, missing tests, and safety risks.",
        "",
        "Context:",
        content,
        "",
        "Output:",
        "- Findings first, ordered by severity.",
        "- Include file/line references when available.",
        "- Keep summary secondary."
      ].join("\n");
    case "debuggingRequest":
      return [
        "Debugging task:",
        "Use the captured context to identify the likely failure, propose a fix, and verify it.",
        "",
        "Observed context:",
        content,
        "",
        "Expected output:",
        "- Suspected root cause.",
        "- Minimal fix plan.",
        "- Verification steps."
      ].join("\n");
  }
}
