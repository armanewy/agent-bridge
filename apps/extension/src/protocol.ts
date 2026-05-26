export type ExtensionMessage =
  | { type: "ui.bindCurrentTab" }
  | { type: "ui.captureSelection" }
  | { type: "ui.healthCheck" };

export type NativeHostMessage =
  | {
      type: "healthCheck";
      sentAt: string;
    }
  | {
      type: "bindSource";
      sentAt: string;
      source: {
        kind: "browserTab";
        browser: "chrome";
        tabId?: number;
        windowId?: number;
        title: string;
        url: string;
        favIconUrl?: string;
      };
    }
  | {
      type: "capture";
      sentAt: string;
      captureType: "selectedText" | "pageTextSummary";
      source: {
        kind: "browserTab";
        browser: "chrome";
        tabId?: number;
        windowId?: number;
        title: string;
        url: string;
      };
      text: string;
      userTriggered: true;
    };

export interface ActiveTabSnapshot {
  id?: number | undefined;
  windowId?: number | undefined;
  title?: string | undefined;
  url?: string | undefined;
  favIconUrl?: string | undefined;
}

export function buildBindSourceMessage(tab: ActiveTabSnapshot, sentAt = new Date().toISOString()): NativeHostMessage {
  if (!tab.url) {
    throw new Error("Active tab does not have a URL.");
  }

  return {
    type: "bindSource",
    sentAt,
    source: {
      kind: "browserTab",
      browser: "chrome",
      ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
      ...(typeof tab.windowId === "number" ? { windowId: tab.windowId } : {}),
      title: tab.title ?? "",
      url: tab.url,
      ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {})
    }
  };
}

export function buildCaptureMessage(
  tab: ActiveTabSnapshot,
  text: string,
  sentAt = new Date().toISOString()
): NativeHostMessage {
  if (!tab.url) {
    throw new Error("Active tab does not have a URL.");
  }

  if (!text.trim()) {
    throw new Error("No selected text was found.");
  }

  return {
    type: "capture",
    sentAt,
    captureType: "selectedText",
    source: {
      kind: "browserTab",
      browser: "chrome",
      ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
      ...(typeof tab.windowId === "number" ? { windowId: tab.windowId } : {}),
      title: tab.title ?? "",
      url: tab.url
    },
    text,
    userTriggered: true
  };
}
