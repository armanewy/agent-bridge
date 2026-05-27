import { z } from "zod";

export const WorkflowRoleSchema = z.enum(["planner", "executor", "reviewer", "verifier", "artifactProvider", "user"]);
export type WorkflowRole = z.infer<typeof WorkflowRoleSchema>;

export const WorkflowTransformSchema = z.enum([
  "userIntentToPlan",
  "plannerToTaskSpec",
  "taskSpecToExecutor",
  "executorToVerification",
  "verificationToReview",
  "reviewToFollowUp",
  "followUpToExecutor",
  "userSteeringToActiveTurn"
]);
export type WorkflowTransform = z.infer<typeof WorkflowTransformSchema>;

export const WorkflowRoleConfigSchema = z.object({
  role: WorkflowRoleSchema,
  providerId: z.string().min(1),
  requiredCapabilities: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
  defaultSessionPolicy: z.enum(["create", "resume", "reuseOrCreate"]).default("reuseOrCreate")
});
export type WorkflowRoleConfig = z.infer<typeof WorkflowRoleConfigSchema>;

export const WorkflowTransitionSchema = z.object({
  id: z.string().min(1),
  fromRole: WorkflowRoleSchema,
  toRole: WorkflowRoleSchema,
  transform: WorkflowTransformSchema,
  requiresApproval: z.boolean().default(false),
  producesArtifactKinds: z.array(z.string()).default([]),
  stopCondition: z.string().optional()
});
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;

export const WorkflowTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  roles: z.array(WorkflowRoleConfigSchema),
  allowedTransitions: z.array(WorkflowTransitionSchema),
  defaultPolicy: z.record(z.unknown()).default({}),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;

export const MissionRoleSessionRefsSchema = z.object({
  planner: z.string().optional(),
  executor: z.string().optional(),
  reviewer: z.string().optional(),
  verifier: z.string().optional(),
  artifactProvider: z.string().optional()
});
export type MissionRoleSessionRefs = z.infer<typeof MissionRoleSessionRefsSchema>;

export function createDefaultChatGptCodexWorkflowTemplate(now = new Date().toISOString()): WorkflowTemplate {
  return {
    id: "workflow_default_chatgpt_codex",
    name: "ChatGPT-style reasoning ↔ Codex coding",
    description: "Default AgentBridge loop: user obtains a structured ChatGPT plan, Codex executes, local verification checks completion.",
    roles: [
      { role: "planner", providerId: "chatgpt-manual", requiredCapabilities: [], optional: true, defaultSessionPolicy: "reuseOrCreate" },
      { role: "reviewer", providerId: "chatgpt-manual", requiredCapabilities: [], optional: true, defaultSessionPolicy: "reuseOrCreate" },
      { role: "executor", providerId: "codex", requiredCapabilities: ["canExecuteCode", "canUseRepo", "canSendMessage"], optional: false, defaultSessionPolicy: "reuseOrCreate" },
      { role: "verifier", providerId: "local-verifier", requiredCapabilities: ["canVerify"], optional: false, defaultSessionPolicy: "create" }
    ],
    allowedTransitions: [
      { id: "transition_intent_plan", fromRole: "user", toRole: "planner", transform: "userIntentToPlan", requiresApproval: false, producesArtifactKinds: ["modelResponse"] },
      { id: "transition_plan_task", fromRole: "planner", toRole: "executor", transform: "plannerToTaskSpec", requiresApproval: false, producesArtifactKinds: ["taskSpec", "generatedPrompt"] },
      { id: "transition_task_exec", fromRole: "planner", toRole: "executor", transform: "taskSpecToExecutor", requiresApproval: false, producesArtifactKinds: ["deliveryResult"] },
      { id: "transition_exec_verify", fromRole: "executor", toRole: "verifier", transform: "executorToVerification", requiresApproval: false, producesArtifactKinds: ["gitDiff", "testOutput", "lintOutput", "typecheckOutput"] },
      { id: "transition_verify_review", fromRole: "verifier", toRole: "reviewer", transform: "verificationToReview", requiresApproval: false, producesArtifactKinds: ["reviewNote"] },
      { id: "transition_review_followup", fromRole: "reviewer", toRole: "executor", transform: "reviewToFollowUp", requiresApproval: false, producesArtifactKinds: ["taskSpec", "generatedPrompt"] },
      { id: "transition_followup_exec", fromRole: "reviewer", toRole: "executor", transform: "followUpToExecutor", requiresApproval: false, producesArtifactKinds: ["deliveryResult"] }
    ],
    defaultPolicy: {
      maxIterations: 3,
      requireVerification: true,
      requireWorktreeIsolation: true,
      approvalRules: ["secrets", "unknownCommands", "repoFileUpload", "largeDiff", "outsideWorkspace"]
    },
    createdAt: now,
    updatedAt: now
  };
}

export function validateWorkflowTemplate(template: WorkflowTemplate): WorkflowTemplate {
  const parsed = WorkflowTemplateSchema.parse(template);
  const roles = new Set(parsed.roles.map((role) => role.role));
  const missingTransitions = parsed.allowedTransitions.filter((transition) => !roles.has(transition.toRole) && transition.toRole !== "user");
  if (missingTransitions.length > 0) {
    throw new Error(`Workflow template has transitions targeting missing roles: ${missingTransitions.map((t) => t.id).join(", ")}`);
  }
  return parsed;
}
