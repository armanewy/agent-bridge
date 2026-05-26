import { z } from "zod";

export const CompletionVerifierKindSchema = z.enum(["textual", "visual", "command", "gitDiff", "humanReview"]);
export type CompletionVerifierKind = z.infer<typeof CompletionVerifierKindSchema>;

export const CompletionContractStatusSchema = z.enum(["draft", "valid", "needs_user_input", "invalid"]);
export type CompletionContractStatus = z.infer<typeof CompletionContractStatusSchema>;

export const CompletionEvidenceStatusSchema = z.enum(["passed", "failed", "missing", "inconclusive"]);
export type CompletionEvidenceStatus = z.infer<typeof CompletionEvidenceStatusSchema>;

export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  evidenceRequired: z.string().min(1),
  verifierKind: CompletionVerifierKindSchema,
  required: z.boolean().default(true)
});
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export const VerificationMethodSchema = z.object({
  id: z.string().min(1),
  kind: CompletionVerifierKindSchema,
  description: z.string().min(1),
  command: z.string().optional(),
  expectedText: z.string().optional(),
  forbiddenText: z.string().optional(),
  visualTarget: z.string().optional(),
  artifactKind: z.string().optional()
});
export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

export const CompletionContractSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  goal: z.string().min(1),
  scope: z.array(z.string()).default([]),
  nonGoals: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  verificationMethods: z.array(VerificationMethodSchema),
  stopConditions: z.array(z.string()).default([]),
  humanReviewTriggers: z.array(z.string()).default([]),
  status: CompletionContractStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type CompletionContract = z.infer<typeof CompletionContractSchema>;

export const CompletionEvidenceSchema = z.object({
  id: z.string().min(1),
  contractId: z.string().min(1),
  criterionId: z.string().min(1),
  sourceArtifactId: z.string().optional(),
  kind: CompletionVerifierKindSchema,
  status: CompletionEvidenceStatusSchema,
  summary: z.string().min(1),
  createdAt: z.string().min(1)
});
export type CompletionEvidence = z.infer<typeof CompletionEvidenceSchema>;

export const CriterionEvaluationSchema = z.object({
  criterionId: z.string().min(1),
  status: z.enum(["met", "failed", "unknown", "needs_review"]),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()).default([])
});
export type CriterionEvaluation = z.infer<typeof CriterionEvaluationSchema>;

export const CompletionEvaluationSchema = z.object({
  contractId: z.string().min(1),
  status: z.enum(["passed", "failed", "needs_review", "blocked"]),
  confidence: z.number().min(0).max(100),
  criterionResults: z.array(CriterionEvaluationSchema),
  reasons: z.array(z.string()).default([]),
  evaluatedAt: z.string().min(1)
});
export type CompletionEvaluation = z.infer<typeof CompletionEvaluationSchema>;

export function validateCompletionContract(contract: CompletionContract): CompletionContract {
  const parsed = CompletionContractSchema.parse(contract);
  const missingObjective = parsed.acceptanceCriteria.filter((criterion) => {
    if (!criterion.required || criterion.verifierKind === "humanReview") return false;
    return !parsed.verificationMethods.some((method) => method.kind === criterion.verifierKind);
  });
  if (missingObjective.length > 0) {
    return { ...parsed, status: "needs_user_input", updatedAt: new Date().toISOString() };
  }
  return { ...parsed, status: "valid", updatedAt: new Date().toISOString() };
}

export function canAutonomouslyPass(contract: CompletionContract): boolean {
  const parsed = validateCompletionContract(contract);
  if (parsed.status !== "valid") return false;
  return parsed.acceptanceCriteria.some((criterion) => criterion.required && criterion.verifierKind !== "humanReview");
}

export function evaluateCompletionContract(
  contract: CompletionContract,
  evidence: CompletionEvidence[],
  evaluatedAt = new Date().toISOString()
): CompletionEvaluation {
  const parsed = validateCompletionContract(contract);
  const criterionResults = parsed.acceptanceCriteria.map((criterion): CriterionEvaluation => {
    const matches = evidence.filter((item) => item.criterionId === criterion.id);
    if (matches.some((item) => item.status === "failed")) {
      return { criterionId: criterion.id, status: "failed", reason: "A required evidence item failed.", evidenceIds: matches.map((m) => m.id) };
    }
    if (criterion.verifierKind === "humanReview") {
      const passed = matches.some((item) => item.status === "passed");
      return {
        criterionId: criterion.id,
        status: passed ? "needs_review" : "needs_review",
        reason: "Human-review criteria cannot produce an autonomous pass.",
        evidenceIds: matches.map((m) => m.id)
      };
    }
    if (matches.some((item) => item.status === "passed")) {
      return { criterionId: criterion.id, status: "met", reason: "Objective evidence passed.", evidenceIds: matches.map((m) => m.id) };
    }
    return { criterionId: criterion.id, status: "unknown", reason: "No objective evidence was provided.", evidenceIds: [] };
  });

  const required = parsed.acceptanceCriteria.filter((criterion) => criterion.required);
  const requiredResults = criterionResults.filter((result) => required.some((criterion) => criterion.id === result.criterionId));
  const failed = requiredResults.some((result) => result.status === "failed");
  const unknown = requiredResults.some((result) => result.status === "unknown" || result.status === "needs_review");
  const blocked = parsed.status === "invalid" || parsed.status === "needs_user_input";

  const status = blocked ? "blocked" : failed ? "failed" : unknown ? "needs_review" : "passed";
  const confidence = status === "passed" ? 90 : status === "failed" ? 30 : status === "blocked" ? 10 : 55;
  const reasons = [
    ...(blocked ? ["Completion contract is not objectively verifiable yet."] : []),
    ...(failed ? ["One or more required criteria failed."] : []),
    ...(unknown ? ["One or more required criteria lack objective evidence or require human review."] : [])
  ];

  return { contractId: parsed.id, status, confidence, criterionResults, reasons, evaluatedAt };
}
