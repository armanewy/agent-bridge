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
  return parseTaskSpecPlan(value);
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

function parseTaskSpecPlan(value: string): TaskSpec | undefined {
  const sections = planSections(value);
  const title = firstSectionLine(sections, "title");
  const goal = firstSectionLine(sections, "goal");
  const background = sectionText(sections, "background");
  const expectedSummaryFormat = sectionText(sections, "expectedSummaryFormat");
  if (!title || !goal || !background || !expectedSummaryFormat) {
    return undefined;
  }
  const instructions = listSection(sections, "instructions");
  const requirements = listSection(sections, "requirements");
  const constraints = listSection(sections, "constraints");
  const nonGoals = listSection(sections, "nonGoals");
  const acceptanceCriteria = listSection(sections, "acceptanceCriteria");
  const suggestedFiles = listSection(sections, "suggestedFiles").filter((item) => !/^none$/i.test(item));
  const verificationSteps = listSection(sections, "verificationSteps").filter((item) => !/^none$/i.test(item));
  if ([instructions, requirements, constraints, nonGoals, acceptanceCriteria].some((items) => items.length === 0)) {
    return undefined;
  }
  return {
    title,
    goal,
    background,
    instructions,
    requirements,
    constraints,
    nonGoals,
    acceptanceCriteria,
    suggestedFiles,
    verificationSteps,
    expectedSummaryFormat
  };
}

function planSections(value: string): Map<TaskSpecPlanSection, string[]> {
  const sections = new Map<TaskSpecPlanSection, string[]>();
  let current: TaskSpecPlanSection | undefined;
  for (const rawLine of value.split(/\r?\n/)) {
    const normalized = normalizeHeading(rawLine);
    if (normalized) {
      current = normalized.key;
      const rest = normalized.rest.trim();
      sections.set(current, rest ? [rest] : []);
      continue;
    }
    if (current) {
      sections.set(current, [...(sections.get(current) ?? []), rawLine]);
    }
  }
  return sections;
}

function normalizeHeading(line: string): { key: TaskSpecPlanSection; rest: string } | undefined {
  const match = line.trim().match(/^#{0,3}\s*([A-Za-z][A-Za-z -]+):\s*(.*)$/);
  if (!match) {
    return undefined;
  }
  const heading = match[1];
  if (!heading) {
    return undefined;
  }
  const rest = match[2] ?? "";
  const key = HEADING_ALIASES[heading.toLowerCase().replace(/[-\s]+/g, " ").trim()];
  return key ? { key, rest } : undefined;
}

function firstSectionLine(sections: Map<TaskSpecPlanSection, string[]>, key: TaskSpecPlanSection): string | undefined {
  return sections.get(key)?.map((line) => cleanListItem(line)).find(Boolean);
}

function sectionText(sections: Map<TaskSpecPlanSection, string[]>, key: TaskSpecPlanSection): string | undefined {
  const text = (sections.get(key) ?? [])
    .map((line) => cleanListItem(line))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || undefined;
}

function listSection(sections: Map<TaskSpecPlanSection, string[]>, key: TaskSpecPlanSection): string[] {
  return (sections.get(key) ?? [])
    .flatMap((line) => line.split(/\n/))
    .map((line) => cleanListItem(line))
    .filter(Boolean);
}

function cleanListItem(line: string): string {
  if (/^\s*[-*]\s*$/.test(line)) {
    return "";
  }
  return line.trim().replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

type TaskSpecPlanSection =
  | "title"
  | "goal"
  | "background"
  | "instructions"
  | "requirements"
  | "constraints"
  | "nonGoals"
  | "acceptanceCriteria"
  | "suggestedFiles"
  | "verificationSteps"
  | "expectedSummaryFormat";

const HEADING_ALIASES: Record<string, TaskSpecPlanSection> = {
  title: "title",
  goal: "goal",
  background: "background",
  instructions: "instructions",
  requirements: "requirements",
  constraints: "constraints",
  "non goals": "nonGoals",
  nongoals: "nonGoals",
  "acceptance criteria": "acceptanceCriteria",
  "done means": "acceptanceCriteria",
  "suggested files": "suggestedFiles",
  "verification steps": "verificationSteps",
  checks: "verificationSteps",
  "expected summary format": "expectedSummaryFormat",
  "summary format": "expectedSummaryFormat"
};
