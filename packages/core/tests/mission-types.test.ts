import { describe, expect, it } from "vitest";
import {
  HandoffCardSchema,
  HandoffSchema,
  MissionSchema,
  TaskSpecSchema,
  type Handoff,
  type HandoffCard,
  type Mission,
  type TaskSpec
} from "../src/types.js";

const now = "2026-01-01T00:00:00.000Z";

const taskSpec: TaskSpec = {
  title: "Implement mission model",
  goal: "Promote handoffs into durable task cards.",
  background: "Captured product direction asks for mission-first task memory.",
  instructions: ["Add schemas", "Preserve compatibility"],
  requirements: ["Mission parses", "HandoffCard parses"],
  constraints: ["Do not break existing Handoff"],
  nonGoals: ["Do not add providers"],
  acceptanceCriteria: ["Tests pass"],
  suggestedFiles: ["packages/core/src/types.ts"],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};

describe("mission-first schemas", () => {
  it("parses Mission", () => {
    const mission: Mission = {
      id: "mission_1",
      title: "Mission model",
      goal: "Create durable task memory.",
      status: "draft",
      sourceIds: ["src_1"],
      captureIds: ["cap_1"],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      createdAt: now,
      updatedAt: now
    };

    expect(MissionSchema.parse(mission).id).toBe("mission_1");
  });

  it("parses TaskSpec", () => {
    expect(TaskSpecSchema.parse(taskSpec).title).toBe("Implement mission model");
  });

  it("parses HandoffCard", () => {
    const card: HandoffCard = {
      id: "card_1",
      missionId: "mission_1",
      sourceId: "src_1",
      captureId: "cap_1",
      targetId: "target_1",
      recipe: "implementationBrief",
      taskSpec,
      generatedPrompt: "Goal:\nPromote handoffs.",
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: [],
      createdAt: now,
      updatedAt: now
    };

    expect(HandoffCardSchema.parse(card).taskSpec.goal).toContain("task cards");
  });

  it("keeps existing Handoff parse-compatible", () => {
    const handoff: Handoff = {
      id: "handoff_1",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Do the thing",
      structured: {
        goal: "Relay",
        context: "Do the thing",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };

    expect(HandoffSchema.parse(handoff).id).toBe("handoff_1");
  });
});
