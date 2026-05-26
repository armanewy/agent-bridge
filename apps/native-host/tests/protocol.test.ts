import { describe, expect, it } from "vitest";
import { handleNativeHostMessage } from "../src/protocol.js";

describe("native host protocol", () => {
  it("handles health checks", async () => {
    await expect(handleNativeHostMessage({ type: "healthCheck" })).resolves.toMatchObject({
      ok: true,
      type: "healthCheck"
    });
  });

  it("rejects unsupported message types", async () => {
    await expect(handleNativeHostMessage({ type: "unknown" })).resolves.toMatchObject({
      ok: false,
      type: "unknown"
    });
  });

  it("converts selected text captures", async () => {
    const response = await handleNativeHostMessage(
      {
        type: "capture",
        captureType: "selectedText",
        source: {
          kind: "browserTab",
          browser: "chrome",
          title: "Example",
          url: "https://example.com"
        },
        text: "selected text",
        userTriggered: true
      },
      { now: () => "2026-01-01T00:00:00.000Z" }
    );

    expect(response.ok).toBe(true);
    expect(response.capture?.text).toBe("selected text");
    expect(response.capture?.userTriggered).toBe(true);
  });
});
