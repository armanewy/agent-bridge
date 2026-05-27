import type { AutopilotRun, AutopilotStep, UserDecision } from "@agentbridge/core";

export interface AutopilotProgressInput {
  run?: AutopilotRun | undefined;
  steps: AutopilotStep[];
  pendingDecision?: UserDecision | undefined;
}

export interface AutopilotProgressStep {
  id: string;
  title: string;
  kind: AutopilotStep["kind"];
  status: AutopilotStep["status"];
  detail?: string | undefined;
}

export interface AutopilotProgressView {
  title: string;
  detail?: string | undefined;
  nextAction: string;
  severity: "active" | "blocked" | "failed" | "cancelled" | "complete";
  steps: AutopilotProgressStep[];
}

const STEP_TITLES: Record<AutopilotStep["kind"], string> = {
  plan: "Plan with ChatGPT",
  createTaskSpec: "Create TaskSpec",
  sendToExecutor: "Send to Codex",
  monitorExecutor: "Monitor Codex",
  verify: "Run verification",
  review: "Review evidence",
  createFollowUp: "Create follow-up",
  steer: "Steer mission",
  requestApproval: "Request approval",
  stop: "Stop"
};

export function buildAutopilotProgressView(status: AutopilotProgressInput | undefined): AutopilotProgressView | undefined {
  const run = status?.run;
  const orderedSteps = [...(status?.steps ?? [])].sort(compareSteps);
  const steps = orderedSteps.map((step) => ({
    id: step.id,
    title: stepTitle(step),
    kind: step.kind,
    status: step.status,
    detail: stepDetail(step)
  }));
  if (!run && steps.length === 0 && !status?.pendingDecision) {
    return undefined;
  }

  const currentStep = orderedSteps.find((step) => step.id === run?.currentStepId) ?? orderedSteps.at(-1);
  const problemStep = [...orderedSteps].reverse().find((step) => step.status === "blocked" || step.status === "failed");
  const detail = firstNonEmpty(run?.stopReason, problemStep ? stepDetail(problemStep) : undefined);
  const severity = severityFor(run?.status);
  return {
    title: progressTitle(run?.status, currentStep),
    ...(detail ? { detail } : {}),
    nextAction: nextActionCopy(run, status?.pendingDecision, problemStep, detail),
    severity,
    steps
  };
}

export function buildChatGptPlannerPrompt(intent: string): string {
  const trimmed = intent.trim();
  return [
    "Read the mission below and return an AgentBridge plan.",
    "Return only the plan. Keep it concise, specific, and directly useful for sending to Codex.",
    "",
    "Use exactly these headings:",
    "Title:",
    "Goal:",
    "Background:",
    "Instructions:",
    "-",
    "Requirements:",
    "-",
    "Constraints:",
    "-",
    "Non-goals:",
    "-",
    "Acceptance criteria:",
    "-",
    "Suggested files:",
    "-",
    "Verification steps:",
    "-",
    "Expected summary format:",
    "",
    "Mission:",
    trimmed
  ].join("\n");
}

function compareSteps(left: AutopilotStep, right: AutopilotStep): number {
  return timestamp(left.startedAt ?? left.completedAt) - timestamp(right.startedAt ?? right.completedAt);
}

function timestamp(value: string | undefined): number {
  return value ? Date.parse(value) || 0 : 0;
}

function progressTitle(status: AutopilotRun["status"] | undefined, currentStep: AutopilotStep | undefined): string {
  if (status === "blocked") {
    return "Blocked";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (status === "passed") {
    return "Passed";
  }
  if (currentStep) {
    return `${stepTitle(currentStep)}: ${currentStep.status}`;
  }
  return status ?? "Idle";
}

function nextActionCopy(
  run: AutopilotRun | undefined,
  pendingDecision: UserDecision | undefined,
  problemStep: AutopilotStep | undefined,
  detail: string | undefined
): string {
  if (pendingDecision) {
    return "Choose an approval option to continue.";
  }
  if (isMissingChatGptPlan(problemStep, detail)) {
    return "Plan with ChatGPT, then stop this run and start again.";
  }
  if (run?.status === "blocked") {
    return "Resolve the blocker, then continue or start again.";
  }
  if (run?.status === "failed") {
    return "Inspect the failed step, fix the cause, then start a new run.";
  }
  if (run?.status === "passed") {
    return "Review the artifacts and verification evidence.";
  }
  if (run?.status === "cancelled") {
    return "Start a new run when ready.";
  }
  return "AgentBridge is working through the mission.";
}

function severityFor(status: AutopilotRun["status"] | undefined): AutopilotProgressView["severity"] {
  if (status === "blocked") {
    return "blocked";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "passed") {
    return "complete";
  }
  return "active";
}

function isMissingChatGptPlan(step: AutopilotStep | undefined, detail: string | undefined): boolean {
  const failureKind = typeof step?.metadata.failureKind === "string" ? step.metadata.failureKind : "";
  const text = `${detail ?? ""} ${failureKind}`.toLowerCase();
  return text.includes("plan with chatgpt") || text.includes("providerunavailable");
}

function stepTitle(step: AutopilotStep): string {
  return typeof step.metadata.title === "string" && step.metadata.title.trim() ? step.metadata.title.trim() : STEP_TITLES[step.kind];
}

function stepDetail(step: AutopilotStep): string | undefined {
  if (typeof step.metadata.error === "string" && step.metadata.error.trim()) {
    return step.metadata.error;
  }
  if (typeof step.metadata.reason === "string" && step.metadata.reason.trim()) {
    return step.metadata.reason;
  }
  return undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}
