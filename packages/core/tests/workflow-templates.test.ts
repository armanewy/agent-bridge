import { describe, expect, it } from "vitest";
import { createDefaultChatGptCodexWorkflowTemplate, validateWorkflowTemplate } from "../src/index.js";

describe("workflow templates", () => {
  it("creates the default Planner to Codex workflow template", () => {
    const template = createDefaultChatGptCodexWorkflowTemplate("2026-05-26T00:00:00.000Z");

    expect(template.name).toBe("ChatGPT-style reasoning ↔ Codex coding");
    expect(template.roles.map((role) => role.role)).toContain("planner");
    expect(template.roles.map((role) => role.role)).toContain("executor");
    expect(template.allowedTransitions.map((transition) => transition.transform)).toContain("plannerToTaskSpec");
    expect(validateWorkflowTemplate(template)).toEqual(template);
  });

  it("rejects transitions to missing roles", () => {
    const template = createDefaultChatGptCodexWorkflowTemplate();
    const broken = {
      ...template,
      roles: template.roles.filter((role) => role.role !== "executor")
    };

    expect(() => validateWorkflowTemplate(broken)).toThrow(/missing roles/);
  });
});
