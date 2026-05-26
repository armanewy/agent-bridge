import { describe, expect, it } from "vitest";
import { CaptureSchema } from "../src/types.js";
import { createHandoff } from "../src/handoff.js";

describe("handoff helpers", () => {
  it("creates a schema-valid handoff from a capture", () => {
    const capture = CaptureSchema.parse({
      id: "cap_1",
      sourceId: "src_1",
      captureType: "selectedText",
      text: "Implement a parser",
      metadata: {},
      createdAt: new Date().toISOString(),
      userTriggered: true
    });

    const handoff = createHandoff({
      id: "handoff_1",
      capture,
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: capture.text
    });

    expect(handoff.structured.originalCaptureRef).toBe("cap_1");
    expect(handoff.prompt).toBe("Implement a parser");
  });
});
