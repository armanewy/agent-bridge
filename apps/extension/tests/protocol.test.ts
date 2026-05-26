import { describe, expect, it } from "vitest";
import { buildBindSourceMessage, buildBrowserTabsDiscoveredMessage, buildCaptureMessage } from "../src/protocol.js";

describe("extension protocol", () => {
  it("builds bindSource messages from active tab metadata", () => {
    const message = buildBindSourceMessage(
      {
        id: 7,
        windowId: 2,
        title: "Example",
        url: "https://example.com"
      },
      "2026-01-01T00:00:00.000Z"
    );

    expect(message).toEqual({
      messageSource: "agentbridge-extension",
      type: "bindSource",
      sentAt: "2026-01-01T00:00:00.000Z",
      source: {
        kind: "browserTab",
        browser: "chrome",
        tabId: 7,
        windowId: 2,
        title: "Example",
        url: "https://example.com"
      }
    });
  });

  it("rejects empty selected-text captures", () => {
    expect(() => buildCaptureMessage({ url: "https://example.com" }, "  ")).toThrow("No selected text");
  });

  it("builds browser tab discovery messages", () => {
    const message = buildBrowserTabsDiscoveredMessage(
      [
        {
          id: 11,
          windowId: 4,
          title: "ChatGPT",
          url: "https://chatgpt.com/",
          active: true
        }
      ],
      "allTabs",
      "2026-01-01T00:00:00.000Z"
    );

    expect(message).toMatchObject({
      type: "browserTabsDiscovered",
      permissionMode: "allTabs",
      tabs: [{ tabId: 11, title: "ChatGPT", url: "https://chatgpt.com/" }]
    });
  });
});
