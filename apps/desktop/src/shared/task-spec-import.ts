import type { TaskSpec } from "@agentbridge/core";

export function extractTaskSpecJson(value: string): string | undefined {
  const taskSpec = parseTaskSpecText(value);
  return taskSpec ? JSON.stringify(taskSpec, null, 2) : undefined;
}

export function parseTaskSpecText(value: string): TaskSpec | undefined {
  for (const candidate of taskSpecJsonCandidates(value)) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isTaskSpec(parsed)) {
        return parsed;
      }
      if (isRecord(parsed) && isTaskSpec(parsed.taskSpec)) {
        return parsed.taskSpec;
      }
    } catch {
      // Text can contain prose plus JSON. Keep trying plausible JSON blocks.
    }
  }
  return undefined;
}

function isTaskSpec(value: unknown): value is TaskSpec {
  if (!isRecord(value)) {
    return false;
  }
  const stringFields = ["title", "goal", "background", "expectedSummaryFormat"];
  const arrayFields = [
    "instructions",
    "requirements",
    "constraints",
    "nonGoals",
    "acceptanceCriteria",
    "suggestedFiles",
    "verificationSteps"
  ];
  return stringFields.every((field) => isNonEmptyString(value[field]))
    && arrayFields.every((field) => isStringArray(value[field]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function taskSpecJsonCandidates(value: string): string[] {
  const candidates = [value.trim()];
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    candidates.push(fenced);
  }
  const objectBlock = value.match(/\{[\s\S]*\}/)?.[0]?.trim();
  if (objectBlock) {
    candidates.push(objectBlock);
  }
  return [...new Set(candidates.filter(Boolean))];
}
