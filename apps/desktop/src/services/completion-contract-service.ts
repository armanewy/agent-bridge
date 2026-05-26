import {
  type AcceptanceCriterion,
  type CompletionContract,
  type CompletionEvidence,
  type TaskSpec,
  evaluateCompletionContract,
  validateCompletionContract
} from "@agentbridge/core";

export interface CompletionContractStorage {
  saveCompletionContract?(contract: CompletionContract): Promise<void>;
  getCompletionContract?(id: string): Promise<CompletionContract | undefined>;
  listCompletionContractsForMission?(missionId: string): Promise<CompletionContract[]>;
  saveCompletionEvidence?(evidence: CompletionEvidence): Promise<void>;
  listCompletionEvidenceForContract?(contractId: string): Promise<CompletionEvidence[]>;
}

export class CompletionContractService {
  constructor(private readonly store: CompletionContractStorage = {}) {}

  async createFromIntent(missionId: string, intent: string): Promise<CompletionContract> {
    const now = new Date().toISOString();
    const contract = validateCompletionContract({
      id: `contract_${missionId}_${Date.now()}`,
      missionId,
      goal: intent.trim() || "Complete the requested mission.",
      scope: [],
      nonGoals: [],
      acceptanceCriteria: [
        {
          id: "criterion_1",
          statement: intent.trim() || "Mission intent is satisfied.",
          evidenceRequired: "Planner-generated TaskSpec and later objective verification.",
          verifierKind: "humanReview",
          required: true
        }
      ],
      verificationMethods: [],
      stopConditions: ["TaskSpec has no objective verification path", "User stopped mission"],
      humanReviewTriggers: ["Intent-only contract needs TaskSpec refinement"],
      status: "draft",
      createdAt: now,
      updatedAt: now
    });
    await this.store.saveCompletionContract?.(contract);
    return contract;
  }

  async createFromTaskSpec(missionId: string, taskSpec: TaskSpec): Promise<CompletionContract> {
    const now = new Date().toISOString();
    const criteria: AcceptanceCriterion[] = taskSpec.acceptanceCriteria.map((statement, index) => ({
      id: `criterion_${index + 1}`,
      statement,
      evidenceRequired: inferEvidenceRequired(statement),
      verifierKind: inferVerifierKind(statement),
      required: true
    }));
    const contract = validateCompletionContract({
      id: `contract_${missionId}_${Date.now()}`,
      missionId,
      goal: taskSpec.goal,
      scope: taskSpec.requirements,
      nonGoals: taskSpec.nonGoals,
      acceptanceCriteria: criteria,
      verificationMethods: taskSpec.verificationSteps.map((step, index) => ({
        id: `verification_${index + 1}`,
        kind: inferVerifierKind(step),
        description: step,
        ...(looksLikeCommand(step) ? { command: step } : {})
      })),
      stopConditions: ["No objective verification path", "Repeated verification failure", "Provider unavailable", "User stopped mission"],
      humanReviewTriggers: ["Visual evidence missing", "Subjective acceptance criterion", "Unexpected file changes"],
      status: "draft",
      createdAt: now,
      updatedAt: now
    });
    await this.store.saveCompletionContract?.(contract);
    return contract;
  }

  validateContract(contract: CompletionContract): CompletionContract {
    return validateCompletionContract(contract);
  }

  async evaluate(contract: CompletionContract): Promise<ReturnType<typeof evaluateCompletionContract>> {
    const evidence = await this.store.listCompletionEvidenceForContract?.(contract.id) ?? [];
    return evaluateCompletionContract(contract, evidence);
  }

  async evaluateEvidence(contractId: string): Promise<ReturnType<typeof evaluateCompletionContract> | undefined> {
    const contract = await this.store.getCompletionContract?.(contractId);
    if (!contract) {
      return undefined;
    }
    return this.evaluate(contract);
  }

  async getLatestForMission(missionId: string): Promise<CompletionContract | undefined> {
    const contracts = await this.store.listCompletionContractsForMission?.(missionId) ?? [];
    return contracts[0];
  }
}

function looksLikeCommand(value: string): boolean {
  return /\b(pnpm|npm|yarn|bun|cargo|go test|pytest|dotnet|make)\b/.test(value);
}

function inferVerifierKind(value: string): "textual" | "visual" | "command" | "gitDiff" | "humanReview" {
  const lower = value.toLowerCase();
  if (looksLikeCommand(value) || lower.includes("test") || lower.includes("lint") || lower.includes("build")) return "command";
  if (lower.includes("screenshot") || lower.includes("visual") || lower.includes("scroll") || lower.includes("visible")) return "visual";
  if (lower.includes("diff") || lower.includes("changed files") || lower.includes("file changes")) return "gitDiff";
  if (lower.includes("feel") || lower.includes("better") || lower.includes("review")) return "humanReview";
  return "textual";
}

function inferEvidenceRequired(value: string): string {
  const kind = inferVerifierKind(value);
  return {
    textual: "Textual assertion or file/content evidence.",
    visual: "Screenshot, DOM, or layout evidence.",
    command: "Configured command result.",
    gitDiff: "Git diff or changed-file evidence.",
    humanReview: "Human review is required; this cannot autonomously pass."
  }[kind];
}
