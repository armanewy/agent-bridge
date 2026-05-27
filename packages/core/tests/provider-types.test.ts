import { describe, expect, it } from "vitest";
import {
  AgentEventSchema,
  AgentProviderProfileSchema,
  AgentSessionRefSchema,
  AgentTurnSchema,
  ExecutorTaskRequestSchema,
  ExecutorTaskResultSchema,
  type TaskSpec
} from "../src/index.js";

const now = "2026-01-01T00:00:00.000Z";

const taskSpec: TaskSpec = {
  title: "Simplify Workbench",
  goal: "Replace link setup with a provider workbench.",
  background: "The product should coordinate planner, executor, and verification providers.",
  instructions: ["Keep scope narrow", "Reuse Mission and HandoffCard"],
  requirements: ["Planner produces a TaskSpec", "Codex receives the generated prompt"],
  constraints: ["Do not add new providers yet"],
  nonGoals: ["Do not add alternate planner routes"],
  acceptanceCriteria: ["TaskSpec is stored", "Delivery mode is explicit"],
  suggestedFiles: ["apps/desktop/src/components/workbench/Workbench.tsx"],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};

describe("provider schemas", () => {
  it("parses provider profiles", () => {
    const profile = AgentProviderProfileSchema.parse({
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canUseRepo", "canCreateSession", "canSendMessage"],
      authMode: "appServer",
      status: "unavailable",
      metadata: {}
    });

    expect(profile.id).toBe("codex");
    expect(profile.capabilities).toContain("canExecuteCode");
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

  it("parses executor request/response objects", () => {
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

    expect(executorRequest.taskSpec.goal).toContain("provider");
    expect(executorResult.deliveryMode).toBe("existingSession");
  });
});
