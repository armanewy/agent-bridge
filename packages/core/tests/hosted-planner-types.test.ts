import { describe, expect, it } from "vitest";
import {
  createDefaultPlannerPayloadPolicy,
  HostedPlannerCreateSessionResponseSchema,
  HostedPlannerMessageRequestSchema,
  HostedPlannerReviewResponseSchema,
  HostedPlannerTaskSpecResponseSchema,
  WorkspaceCandidateSchema
} from "../src/index.js";

describe("hosted planner and workspace schemas", () => {
  it("parses a valid workspace candidate", () => {
    const candidate = WorkspaceCandidateSchema.parse({
      id: "workspace_1",
      repoName: "agent-bridge",
      repoPath: "C:/repo/agent-bridge",
      source: "codexAppServerThread",
      confidence: 95,
      evidence: ["Codex thread cwd matched prior repo."],
      requiresConfirmation: false,
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    expect(candidate.confidence).toBe(95);
  });

  it("rejects invalid workspace confidence", () => {
    expect(() =>
      WorkspaceCandidateSchema.parse({
        id: "workspace_1",
        source: "windowTitle",
        confidence: 101,
        evidence: [],
        requiresConfirmation: true,
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("creates a repo-minimal default planner payload policy", () => {
    const policy = createDefaultPlannerPayloadPolicy();

    expect(policy.includeRepoIdentity).toBe("nameOnly");
    expect(policy.includeArtifacts).toBe("approvedOnly");
    expect(policy.redactBeforeSend).toBe(true);
  });

  it("parses hosted planner request and response examples", () => {
    expect(
      HostedPlannerMessageRequestSchema.parse({
        sessionId: "planner_session_1",
        payload: { intent: "Simplify the Workbench." }
      })
    ).toMatchObject({ sessionId: "planner_session_1" });

    expect(
      HostedPlannerCreateSessionResponseSchema.parse({
        sessionId: "planner_session_1",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    ).toMatchObject({ sessionId: "planner_session_1" });

    const taskSpec = {
      title: "Simplify Workbench",
      goal: "Reduce default UI clutter.",
      background: "AgentBridge is intent-first.",
      instructions: ["Keep Simple Mode narrow."],
      requirements: ["No repo picker before intent."],
      constraints: ["Do not add providers."],
      nonGoals: ["No browser imports."],
      acceptanceCriteria: ["Intent can start a mission."],
      suggestedFiles: [],
      verificationSteps: [],
      expectedSummaryFormat: "Summary and verification."
    };

    expect(
      HostedPlannerTaskSpecResponseSchema.parse({
        taskSpec,
        requestId: "req_1",
        createdAt: "2026-01-01T00:00:00.000Z"
      }).taskSpec.title
    ).toBe("Simplify Workbench");

    expect(
      HostedPlannerReviewResponseSchema.parse({
        reviewSummary: "Looks scoped.",
        statusSuggestion: "needs_review",
        requestId: "req_2",
        createdAt: "2026-01-01T00:00:00.000Z"
      }).statusSuggestion
    ).toBe("needs_review");
  });
});
