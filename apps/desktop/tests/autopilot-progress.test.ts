import { describe, expect, it } from "vitest";
import type { AutopilotRun, AutopilotStep } from "@agentbridge/core";
import { buildAutopilotProgressView, buildChatGptPlannerPrompt } from "../src/shared/autopilot-progress.js";

describe("autopilot progress view", () => {
  it("surfaces missing ChatGPT plan blockers without asking users to write JSON", () => {
    const run: AutopilotRun = {
      id: "autopilot_run_1",
      missionId: "mission_1",
      policyId: "policy_supervised_default",
      status: "blocked",
      iteration: 0,
      maxIterations: 3,
      currentStepId: "autopilot_step_1",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
      stopReason: "Plan with ChatGPT before starting the mission."
    };
    const step: AutopilotStep = {
      id: "autopilot_step_1",
      autopilotRunId: run.id,
      missionId: run.missionId,
      kind: "plan",
      status: "blocked",
      inputArtifactIds: [],
      outputArtifactIds: [],
      startedAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:05.000Z",
      metadata: {
        title: "Plan with ChatGPT",
        error: "Plan with ChatGPT before starting the mission.",
        failureKind: "providerUnavailable"
      }
    };

    const view = buildAutopilotProgressView({ run, steps: [step] });

    expect(view?.title).toBe("Blocked");
    expect(view?.detail).toContain("Plan with ChatGPT");
    expect(view?.nextAction).toContain("Plan with ChatGPT");
    expect(view?.nextAction).not.toContain("JSON");
    expect(view?.steps[0]).toMatchObject({ title: "Plan with ChatGPT", status: "blocked" });
  });

  it("builds a readable ChatGPT planner request", () => {
    const prompt = buildChatGptPlannerPrompt("Add a test.");

    expect(prompt).toContain("Use exactly these headings:");
    expect(prompt).toContain("Acceptance criteria:");
    expect(prompt).toContain("Mission:\nAdd a test.");
    expect(prompt).not.toContain("JSON");
  });
});
