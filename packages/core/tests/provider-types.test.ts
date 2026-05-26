import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  AgentProviderProfileSchema,
  AgentSessionRefSchema,
  AgentTurnSchema,
  ExecutorTaskRequestSchema,
  ExecutorTaskResultSchema,
  PlannerRequestSchema,
  PlannerResponseSchema,
  ReviewRequestSchema,
  ReviewResultSchema,
  type TaskSpec,
  type VerificationResult
} from "../src/index.js";

const now = "2026-01-01T00:00:00.000Z";

const taskSpec: TaskSpec = {
  title: "Simplify Workbench",
  goal: "Replace link setup with a provider workbench.",
  background: "The product should coordinate planner, executor, and verification providers.",
  instructions: ["Keep scope narrow", "Reuse Mission and HandoffCard"],
  requirements: ["Planner produces a TaskSpec", "Codex receives the generated prompt"],
  constraints: ["Do not add new providers yet"],
  nonGoals: ["Do not expand browser extension setup"],
  acceptanceCriteria: ["TaskSpec is stored", "Delivery mode is explicit"],
  suggestedFiles: ["apps/desktop/src/components/workbench/Workbench.tsx"],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};

const verificationResult: VerificationResult = {
  id: "verification_1",
  missionId: "mission_1",
  status: "failed",
  commandResults: [
    {
      kind: "test",
      command: "pnpm test",
      exitCode: 1,
      status: "failed",
      outputArtifactId: "artifact_test",
      durationMs: 1200
    }
  ],
  summary: "Tests failed.",
  artifactIds: ["artifact_test"],
  createdAt: now
};

describe("provider schemas", () => {
  it("parses provider profiles", () => {
    const profile = AgentProviderProfileSchema.parse({
      id: "openai-planner",
      kind: "planner",
      displayName: "OpenAI Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canSendMessage"],
      authMode: "apiKey",
      status: "needsAuth",
      metadata: { model: "gpt-4.1" }
    });

    expect(profile.id).toBe("openai-planner");
    expect(profile.capabilities).toContain("canPlan");
  });

  it("parses provider sessions, turns, and events", () => {
    const session = AgentSessionRefSchema.parse({
      id: "session_1",
      providerId: "codex",
      providerKind: "executor",
      externalSessionId: "thread_123",
      title: "AgentBridge workbench",
      repoPath: "C:/repo",
      status: "idle",
      createdAt: now,
      lastSeenAt: now,
      metadata: { source: "appServer" }
    });
    const turn = AgentTurnSchema.parse({
      id: "turn_1",
      providerId: "codex",
      sessionRefId: session.id,
      externalTurnId: "turn_external_1",
      role: "assistant",
      content: "Implemented the task.",
      status: "completed",
      artifactIds: ["artifact_1"],
      createdAt: now,
      completedAt: now,
      metadata: {}
    });
    const event = AgentEventSchema.parse({
      id: "event_1",
      providerId: "codex",
      sessionRefId: session.id,
      turnId: turn.id,
      type: "turn.completed",
      payload: { ok: true },
      createdAt: now
    });

    expect(session.externalSessionId).toBe("thread_123");
    expect(turn.artifactIds).toEqual(["artifact_1"]);
    expect(event.type).toBe("turn.completed");
  });

  it("parses planner and executor request/response objects", () => {
    const plannerRequest = PlannerRequestSchema.parse({
      missionId: "mission_1",
      prompt: "Plan this implementation.",
      contextArtifactIds: ["artifact_capture"],
      metadata: {}
    });
    const plannerResponse = PlannerResponseSchema.parse({
      providerId: "openai-planner",
      sessionRefId: "session_1",
      turnId: "turn_1",
      content: "Build the provider workbench in stages.",
      taskSpec,
      artifactIds: ["artifact_plan"],
      createdAt: now,
      metadata: {}
    });
    const executorRequest = ExecutorTaskRequestSchema.parse({
      missionId: "mission_1",
      sessionRefId: "session_codex",
      taskSpec,
      generatedPrompt: "Goal\nSimplify Workbench",
      dryRun: false,
      metadata: {}
    });
    const executorResult = ExecutorTaskResultSchema.parse({
      providerId: "codex",
      deliveryMode: "existingSession",
      success: true,
      warnings: [],
      artifactIds: ["artifact_delivery"],
      createdAt: now,
      metadata: { codexThreadId: "thread_123" }
    });

    expect(plannerRequest.prompt).toContain("Plan");
    expect(plannerResponse.taskSpec?.title).toBe("Simplify Workbench");
    expect(executorRequest.taskSpec.goal).toContain("provider");
    expect(executorResult.deliveryMode).toBe("existingSession");
  });

  it("parses review request and result objects", () => {
    const request = ReviewRequestSchema.parse({
      missionId: "mission_1",
      taskSpec,
      verificationResult,
      artifactIds: ["artifact_test"],
      metadata: {}
    });
    const result = ReviewResultSchema.parse({
      providerId: "openai-planner",
      sessionRefId: "session_1",
      turnId: "turn_review",
      content: "Follow up on the failing test only.",
      statusSuggestion: "follow_up_needed",
      followUpTaskSpec: {
        ...taskSpec,
        title: "Fix failing Workbench test",
        goal: "Fix only the failing test."
      },
      artifactIds: ["artifact_review"],
      createdAt: now,
      metadata: {}
    });

    expect(request.verificationResult?.status).toBe("failed");
    expect(result.followUpTaskSpec?.goal).toBe("Fix only the failing test.");
  });
});
