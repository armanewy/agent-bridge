import { describe, expect, it } from "vitest";
import type { Capture } from "../src/types.js";
import { buildPrompt, transformCapture } from "../src/transform.js";

const capture: Capture = {
  id: "cap_1",
  sourceId: "src_1",
  captureType: "selectedText",
  text: "Add a settings page",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  userTriggered: true
};

describe("deterministic transforms", () => {
  it("builds implementation briefs", () => {
    expect(buildPrompt(capture, "implementationBrief")).toContain("Acceptance criteria:");
  });

  it("creates handoffs with redaction findings", () => {
    const handoff = transformCapture({
      id: "handoff_1",
      capture: { ...capture, text: "Use Bearer abcdefghijklmnopqrstuvwxyz12345" },
      targetId: "target_1",
      recipe: "rawRelay"
    });

    expect(handoff.redactionFindings[0]?.kind).toBe("bearerToken");
  });
});
