import type { CompletionEvaluation } from "./completion-contracts.js";

export type AutopilotDecisionKind = "continue" | "retryWithFollowUp" | "askUser" | "stopPassed" | "stopFailed" | "stopBlocked";

export interface AutopilotDecisionInput {
  completionEvaluation?: CompletionEvaluation;
  iteration: number;
  maxIterations: number;
  repeatedFailureCount?: number;
  repeatedDiffCount?: number;
  noChangeTurnCount?: number;
  providerWarnings?: string[];
  policyWarnings?: string[];
  highRiskUnrelatedChanges?: string[];
  redactionBlocked?: boolean;
}

export interface AutopilotDecision {
  kind: AutopilotDecisionKind;
  reason: string;
  requiresUserInput: boolean;
}

export function decideAutopilot(input: AutopilotDecisionInput): AutopilotDecision {
  if (input.redactionBlocked) return stopBlocked("A high-severity redaction finding blocked the mission.");
  if (input.iteration >= input.maxIterations) return stopBlocked("Maximum autonomous iteration count reached.");
  if ((input.repeatedFailureCount ?? 0) >= 2) return stopBlocked("The same verification failure repeated.");
  if ((input.repeatedDiffCount ?? 0) >= 2) return stopBlocked("The mission is repeating the same diff.");
  if ((input.noChangeTurnCount ?? 0) >= 2) return stopBlocked("The executor produced no meaningful changes twice.");
  if ((input.highRiskUnrelatedChanges ?? []).length > 0) return askUser("High-risk unrelated file changes were detected.");
  const policyWarning = input.policyWarnings?.[0];
  if (policyWarning) return askUser(policyWarning);
  const providerWarning = input.providerWarnings?.[0];
  if (providerWarning) return askUser(providerWarning);

  const evaluation = input.completionEvaluation;
  if (!evaluation) return { kind: "continue", reason: "No completion evaluation exists yet.", requiresUserInput: false };
  if (evaluation.status === "passed") return { kind: "stopPassed", reason: "All required objective evidence passed.", requiresUserInput: false };
  if (evaluation.status === "failed") return { kind: "retryWithFollowUp", reason: "Completion evidence failed; a follow-up is needed.", requiresUserInput: false };
  if (evaluation.status === "needs_review") return askUser("Completion evidence is inconclusive or requires human review.");
  return stopBlocked(evaluation.reasons[0] ?? "Completion contract is blocked.");
}

function askUser(reason: string): AutopilotDecision {
  return { kind: "askUser", reason, requiresUserInput: true };
}

function stopBlocked(reason: string): AutopilotDecision {
  return { kind: "stopBlocked", reason, requiresUserInput: true };
}
