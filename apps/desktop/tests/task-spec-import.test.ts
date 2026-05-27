import { describe, expect, it } from "vitest";
import { extractTaskSpecJson, parseTaskSpecText } from "../src/shared/task-spec-import.js";

describe("task-spec import", () => {
  it("parses a readable ChatGPT plan into a TaskSpec", () => {
    const plan = [
      "Title: Completion contract evidence regression",
      "Goal: Add a regression test for missing completion evidence.",
      "Background: AgentBridge should not autonomously pass criteria without required evidence.",
      "Instructions:",
      "- Find the completion contract verification tests.",
      "- Add coverage for missing visual or textual evidence.",
      "Requirements:",
      "- Required criteria cannot pass without evidence.",
      "- Human-review-only criteria can become needs_review.",
      "Constraints:",
      "- Do not change provider routing.",
      "- Do not change store schema.",
      "Non-goals:",
      "- Do not redesign Workbench UI.",
      "Acceptance criteria:",
      "- The regression test fails without the safety check.",
      "- pnpm test passes.",
      "Suggested files:",
      "- apps/desktop/tests/completion-contract-service.test.ts",
      "Verification steps:",
      "- pnpm test",
      "- pnpm lint",
      "Expected summary format: Summary, verification, remaining risk."
    ].join("\n");

    const taskSpec = parseTaskSpecText(plan);

    expect(taskSpec?.title).toBe("Completion contract evidence regression");
    expect(taskSpec?.acceptanceCriteria).toContain("The regression test fails without the safety check.");
    expect(taskSpec?.verificationSteps).toEqual(["pnpm test", "pnpm lint"]);
    expect(extractTaskSpecJson(plan)).toContain("\"title\": \"Completion contract evidence regression\"");
  });
});
