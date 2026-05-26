import { describe, expect, it } from "vitest";
import {
  AutopilotPolicySchema,
  AutopilotRunSchema,
  AutopilotStepSchema,
  UserDecisionSchema,
  type AutopilotPolicy,
  type AutopilotRun,
  type AutopilotStep,
  type UserDecision
} from "../src/types.js";

const now = "2026-01-01T00:00:00.000Z";

describe("autopilot schemas", () => {
  it("parses policy, run, step, and pending decision records", () => {
    const policy: AutopilotPolicy = {
      id: "policy_1",
      name: "Supervised",
      mode: "supervised",
      maxIterations: 3,
      allowPlannerTurnsWithoutApproval: true,
      allowCodexTurnsWithoutApproval: false,
      allowVerificationWithoutApproval: true,
      allowShellCommands: "configuredOnly",
      allowFileWrites: "repoOnly",
      allowNetworkAccess: false,
      stopOnVerificationFailure: false,
      stopOnRedactionFinding: true,
      stopOnProviderWarning: true,
      createdAt: now,
      updatedAt: now
    };
    const run: AutopilotRun = {
      id: "autopilot_run_1",
      missionId: "mission_1",
      policyId: policy.id,
      status: "planning",
      iteration: 0,
      maxIterations: policy.maxIterations,
      startedAt: now,
      updatedAt: now
    };
    const step: AutopilotStep = {
      id: "autopilot_step_1",
      autopilotRunId: run.id,
      missionId: run.missionId,
      kind: "plan",
      status: "pending",
      inputArtifactIds: [],
      outputArtifactIds: [],
      metadata: {}
    };
    const decision: UserDecision = {
      id: "decision_1",
      missionId: run.missionId,
      autopilotRunId: run.id,
      decisionType: "approveAction",
      prompt: "Allow Codex turn?",
      options: ["Approve", "Stop"],
      status: "pending",
      createdAt: now
    };

    expect(AutopilotPolicySchema.parse(policy).mode).toBe("supervised");
    expect(AutopilotRunSchema.parse(run).status).toBe("planning");
    expect(AutopilotStepSchema.parse(step).kind).toBe("plan");
    expect(UserDecisionSchema.parse(decision).status).toBe("pending");
  });
});
