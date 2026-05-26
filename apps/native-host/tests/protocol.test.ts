import { describe, expect, it } from "vitest";
import { handleNativeHostMessage } from "../src/protocol.js";

describe("native host protocol", () => {
  it("handles health checks", async () => {
    await expect(handleNativeHostMessage({ type: "healthCheck", extensionVersion: "0.1.0" })).resolves.toMatchObject({
      ok: true,
      type: "healthCheck",
      heartbeat: {
        messageType: "healthCheck",
        extensionVersion: "0.1.0"
      }
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

  it("converts discovered browser tabs into linkable components", async () => {
    const response = await handleNativeHostMessage(
      {
        type: "browserTabsDiscovered",
        permissionMode: "allTabs",
        tabs: [
          {
            kind: "browserTab",
            browser: "chrome",
            tabId: 9,
            windowId: 1,
            title: "ChatGPT - Notes",
            url: "https://chatgpt.com/"
          }
        ]
      },
      { now: () => "2026-01-01T00:00:00.000Z" }
    );

    expect(response.ok).toBe(true);
    expect(response.components?.[0]).toMatchObject({
      id: "component_browser_chrome_1_9",
      kind: "browserTab",
      provider: "chatgpt",
      roleCapabilities: { canBeSource: true, canCapture: true }
    });
    expect(response.components?.[0]?.backingRef).toMatchObject({ tabId: 9, windowId: 1 });
    expect(response.components?.[0]?.backingRef).not.toHaveProperty("sourceId");
  });
});
