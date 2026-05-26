import { randomUUID } from "node:crypto";
import {
  applyRedactions,
  createDefaultPlannerPayloadPolicy,
  detectRedactions,
  hasHighSeverityFinding,
  type Artifact,
  type PlannerPayloadPolicy,
  type RedactionFinding,
  type RepoContextPack,
  type ReviewRequest,
  type TaskSpec
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export type PlannerPayloadPurpose = "plan" | "taskSpec" | "review" | "followUp";

export interface PlannerPayloadInput {
  prompt?: string;
  taskSpec?: TaskSpec;
  verificationSummary?: string;
  artifactIds?: string[];
  contextArtifactIds?: string[];
  repoContext?: RepoContextPack;
  metadata?: Record<string, unknown>;
}

export interface PlannerPayloadBuildResult {
  payload: Record<string, unknown>;
  includedArtifactIds: string[];
  excludedArtifactIds: string[];
  excludedReasons: Record<string, string>;
  redactionFindings: RedactionFinding[];
  estimatedBytes: number;
  policyUsed: PlannerPayloadPolicy;
}

export class PlannerPayloadBuilder {
  constructor(
    private readonly store: LocalStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly defaultPolicy: PlannerPayloadPolicy = createDefaultPlannerPayloadPolicy()
  ) {}

  async buildPlannerRequestPayload(
    missionId: string | undefined,
    purpose: PlannerPayloadPurpose,
    input: PlannerPayloadInput = {},
    policy: PlannerPayloadPolicy = this.defaultPolicy
  ): Promise<PlannerPayloadBuildResult> {
    const mission = missionId ? await this.store.getMission(missionId) : undefined;
    const repoContext = mission?.repoContext ?? input.repoContext;
    const artifacts = missionId ? await this.store.listArtifactsForMission(missionId) : [];
    const verificationResults = missionId ? await this.store.listVerificationResultsForMission(missionId) : [];
    const requestedArtifactIds = unique([...(input.contextArtifactIds ?? []), ...(input.artifactIds ?? [])]);
    const artifactSummaries = summarizeArtifacts(artifacts, requestedArtifactIds, policy);
    const latestVerification = verificationResults[0];

    const payload: Record<string, unknown> = {
      purpose,
      missionId,
      createdAt: this.now(),
      ...(policy.includeIntent ? { intent: input.prompt ?? mission?.goal } : {}),
      ...(policy.includeMissionSummary && mission
        ? {
            mission: {
              id: mission.id,
              title: mission.title,
              goal: mission.goal,
              status: mission.status
            }
          }
        : {}),
      ...(policy.includeRepoIdentity !== "never" && repoContext
        ? { repoIdentity: repoIdentity(repoContext, policy) }
        : {}),
      ...(policy.includeTaskSpec ? { taskSpec: input.taskSpec ?? latestTaskSpecArtifact(artifacts) } : {}),
      ...(policy.includeDiffSummary ? { diffSummary: latestArtifactExcerpt(artifacts, "gitDiff", policy.maxLogExcerptBytes) } : {}),
      ...(policy.includeCommandOutputs !== "never"
        ? { commandOutputExcerpts: commandOutputExcerpts(artifacts, policy.maxLogExcerptBytes) }
        : {}),
      ...(input.verificationSummary || latestVerification
        ? {
            verification: {
              status: latestVerification?.status,
              summary: truncate(input.verificationSummary ?? latestVerification?.summary ?? "", policy.maxLogExcerptBytes)
            }
          }
        : {}),
      artifacts: artifactSummaries.included,
      metadata: input.metadata ?? {},
      policy: {
        repoFilesIncluded: false,
        repoPathIncluded: policy.includeRepoIdentity === "fullPathIfLocalOnly",
        commandOutputs: policy.includeCommandOutputs,
        artifacts: policy.includeArtifacts
      }
    };

    const { value: redactedPayload, findings } = policy.redactBeforeSend ? redactValue(payload) : { value: payload, findings: detectRedactions(JSON.stringify(payload)) };
    const estimatedBytes = Buffer.byteLength(JSON.stringify(redactedPayload), "utf8");
    return {
      payload: redactedPayload as Record<string, unknown>,
      includedArtifactIds: artifactSummaries.includedArtifactIds,
      excludedArtifactIds: artifactSummaries.excludedArtifactIds,
      excludedReasons: artifactSummaries.excludedReasons,
      redactionFindings: findings,
      estimatedBytes,
      policyUsed: policy
    };
  }
}

export async function savePlannerPayloadSummaryArtifact(
  store: LocalStore,
  missionId: string,
  purpose: PlannerPayloadPurpose,
  result: PlannerPayloadBuildResult,
  now: () => string = () => new Date().toISOString()
): Promise<string> {
  const artifact: Artifact = {
    id: `artifact_${randomUUID()}`,
    missionId,
    kind: "reviewNote",
    title: "Hosted Planner payload summary",
    content: JSON.stringify(
      {
        purpose,
        estimatedBytes: result.estimatedBytes,
        includedArtifactIds: result.includedArtifactIds,
        excludedArtifactIds: result.excludedArtifactIds,
        excludedReasons: result.excludedReasons,
        redactionFindings: result.redactionFindings,
        policyUsed: result.policyUsed,
        payload: result.payload
      },
      null,
      2
    ),
    metadata: {
      source: "hostedPlannerPayloadSummary",
      purpose,
      estimatedBytes: result.estimatedBytes,
      redactionFindingCount: result.redactionFindings.length,
      highSeverityBlocked: hasHighSeverityFinding(result.redactionFindings)
    },
    createdAt: now()
  };
  await store.saveArtifact(artifact);
  return artifact.id;
}

export function assertPlannerPayloadAllowed(result: PlannerPayloadBuildResult): void {
  if (hasHighSeverityFinding(result.redactionFindings)) {
    throw new Error("Hosted Planner payload contains a high-severity secret finding. Review the payload before sending.");
  }
  if (result.estimatedBytes > result.policyUsed.maxPayloadBytes) {
    throw new Error(`Hosted Planner payload is too large (${result.estimatedBytes} bytes).`);
  }
}

export function plannerPayloadHasHighSeverityFinding(result: PlannerPayloadBuildResult): boolean {
  return hasHighSeverityFinding(result.redactionFindings);
}

function summarizeArtifacts(artifacts: Artifact[], requestedArtifactIds: string[], policy: PlannerPayloadPolicy): {
  included: Array<Record<string, unknown>>;
  includedArtifactIds: string[];
  excludedArtifactIds: string[];
  excludedReasons: Record<string, string>;
} {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const requested = requestedArtifactIds.map((id) => byId.get(id)).filter((artifact): artifact is Artifact => Boolean(artifact));
  const candidates = requested.length ? requested : artifacts.filter((artifact) => artifact.metadata.includeInHostedPlanner === true);
  const included: Array<Record<string, unknown>> = [];
  const includedArtifactIds: string[] = [];
  const excludedArtifactIds: string[] = [];
  const excludedReasons: Record<string, string> = {};

  for (const artifact of candidates) {
    if (policy.includeArtifacts === "never") {
      excludedArtifactIds.push(artifact.id);
      excludedReasons[artifact.id] = "Policy excludes artifacts.";
      continue;
    }
    const approved = artifact.metadata.approvedForPlanner === true || artifact.metadata.includeInHostedPlanner === true;
    const safeSummaryOnly = artifact.kind === "taskSpec" || artifact.kind === "modelResponse" || artifact.kind === "deliveryResult";
    if (policy.includeArtifacts === "approvedOnly" && !approved && !safeSummaryOnly) {
      excludedArtifactIds.push(artifact.id);
      excludedReasons[artifact.id] = "Artifact was not approved for hosted Planner.";
      continue;
    }
    includedArtifactIds.push(artifact.id);
    included.push({
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      createdAt: artifact.createdAt,
      excerpt: artifact.content ? truncate(artifact.content, 1600) : undefined
    });
  }

  for (const artifact of artifacts) {
    if (!includedArtifactIds.includes(artifact.id) && !excludedArtifactIds.includes(artifact.id) && artifact.kind === "fileReference") {
      excludedArtifactIds.push(artifact.id);
      excludedReasons[artifact.id] = "Repo or file artifact excluded by default.";
    }
  }

  return { included, includedArtifactIds, excludedArtifactIds, excludedReasons };
}

function repoIdentity(repo: RepoContextPack, policy: PlannerPayloadPolicy): Record<string, unknown> {
  const name = repo.repoName ?? repoNameFromPath(repo.repoPath);
  if (policy.includeRepoIdentity === "nameOnly") {
    return { repoName: name, hasLocalPath: Boolean(repo.repoPath) };
  }
  if (policy.includeRepoIdentity === "nameAndBranch") {
    return {
      repoName: name,
      ...(repo.currentBranch ? { branch: repo.currentBranch } : {}),
      ...(repo.gitStatusSummary ? { gitStatusSummary: repo.gitStatusSummary } : {}),
      hasLocalPath: Boolean(repo.repoPath)
    };
  }
  return {
    repoName: name,
    fullPath: repo.repoPath,
    ...(repo.currentBranch ? { branch: repo.currentBranch } : {}),
    hasLocalPath: true
  };
}

function latestTaskSpecArtifact(artifacts: Artifact[]): unknown {
  const artifact = artifacts.find((item) => item.kind === "taskSpec" && item.content);
  if (!artifact?.content) {
    return undefined;
  }
  try {
    return JSON.parse(artifact.content) as unknown;
  } catch {
    return truncate(artifact.content, 4000);
  }
}

function latestArtifactExcerpt(artifacts: Artifact[], kind: Artifact["kind"], limit: number): string | undefined {
  const artifact = artifacts.find((item) => item.kind === kind && item.content);
  return artifact?.content ? truncate(artifact.content, limit) : undefined;
}

function commandOutputExcerpts(artifacts: Artifact[], limit: number): Array<Record<string, unknown>> {
  return artifacts
    .filter((artifact) => ["testOutput", "lintOutput", "typecheckOutput", "terminalLog"].includes(artifact.kind))
    .slice(0, 4)
    .map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      excerpt: truncate(artifact.content ?? "", limit)
    }));
}

function redactValue(value: unknown): { value: unknown; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      const itemFindings = detectRedactions(item);
      findings.push(...itemFindings);
      return itemFindings.length ? applyRedactions(item, itemFindings) : item;
    }
    if (Array.isArray(item)) {
      return item.map(visit);
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, visit(nested)]));
    }
    return item;
  };
  return { value: visit(value), findings };
}

function truncate(value: string, max = 4000): string {
  return value.length > max ? `${value.slice(0, max)}\n[truncated ${value.length - max} chars]` : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function repoNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
}

export function buildReviewInput(input: ReviewRequest): PlannerPayloadInput {
  const payloadInput: PlannerPayloadInput = {
    taskSpec: input.taskSpec
  };
  if (input.artifactIds) {
    payloadInput.artifactIds = input.artifactIds;
  }
  const verificationSummary = input.verificationSummary ?? input.verificationResult?.summary;
  if (verificationSummary) {
    payloadInput.verificationSummary = verificationSummary;
  }
  if (input.metadata) {
    payloadInput.metadata = input.metadata;
  }
  return payloadInput;
}
