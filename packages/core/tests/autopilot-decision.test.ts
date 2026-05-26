import { describe, expect, it } from "vitest";
import { decideAutopilot, type CompletionEvaluation } from "../src/index.js";

describe("autopilot decision", () => {
  it("stops passed when objective completion evidence passes", () => {
    expect(decideAutopilot({ iteration: 1, maxIterations: 3, completionEvaluation: evaluation("passed") })).toMatchObject({
      kind: "stopPassed",
      requiresUserInput: false
    });
  });

  it("asks the user when evidence is missing or inconclusive", () => {
    expect(decideAutopilot({ iteration: 1, maxIterations: 3, completionEvaluation: evaluation("needs_review") })).toMatchObject({
      kind: "askUser",
      requiresUserInput: true
    });
  });

  it("blocks repeated failure loops", () => {
    expect(decideAutopilot({ iteration: 1, maxIterations: 3, repeatedFailureCount: 2 })).toMatchObject({
      kind: "stopBlocked"
    });
  });

  it("blocks repeated no-change executor turns", () => {
    expect(decideAutopilot({ iteration: 1, maxIterations: 3, noChangeTurnCount: 2 })).toMatchObject({
      kind: "stopBlocked"
    });
  });

  function evaluation(status: CompletionEvaluation["status"]): CompletionEvaluation {
    return {
      contractId: "contract_1",
      status,
      confidence: status === "passed" ? 90 : 50,
      criterionResults: [],
      reasons: [],
      evaluatedAt: "2026-05-26T00:00:00.000Z"
    };
  }
});
