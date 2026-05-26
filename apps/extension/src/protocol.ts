export type ExtensionMessage =
  | { type: "ui.bindCurrentTab" }
  | { type: "ui.discoverTabs" }
  | { type: "ui.captureSelection" }
  | { type: "ui.captureLatestMessage" }
  | { type: "ui.healthCheck" };

export interface NativeHostMessageMetadata {
  extensionId?: string;
  extensionVersion?: string;
  messageSource: "agentbridge-extension";
}

export type NativeHostMessage =
  NativeHostMessageMetadata &
    ({
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
      type: "browserTabsDiscovered";
      sentAt: string;
      permissionMode: "allTabs" | "activeTab";
      tabs: Array<{
        kind: "browserTab";
        browser: "chrome";
        tabId?: number;
        windowId?: number;
        title: string;
        url: string;
        favIconUrl?: string;
        active?: boolean;
      }>;
    }
  | {
      type: "capture";
      sentAt: string;
      captureType: "selectedText" | "latestMessage" | "pageTextSummary";
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
    });

export interface ActiveTabSnapshot {
  id?: number | undefined;
  windowId?: number | undefined;
  title?: string | undefined;
  url?: string | undefined;
  favIconUrl?: string | undefined;
}

export function buildExtensionMetadata(): NativeHostMessageMetadata {
  const runtime = typeof chrome !== "undefined" ? chrome.runtime : undefined;
  return {
    messageSource: "agentbridge-extension",
    ...(runtime?.id ? { extensionId: runtime.id } : {}),
    ...(runtime?.getManifest().version ? { extensionVersion: runtime.getManifest().version } : {})
  };
}

export function buildHealthCheckMessage(sentAt = new Date().toISOString()): NativeHostMessage {
  return {
    ...buildExtensionMetadata(),
    type: "healthCheck",
    sentAt
  };
}

export function buildBindSourceMessage(tab: ActiveTabSnapshot, sentAt = new Date().toISOString()): NativeHostMessage {
  if (!tab.url) {
    throw new Error("Active tab does not have a URL.");
  }

  return {
    ...buildExtensionMetadata(),
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
  sentAt = new Date().toISOString(),
  captureType: "selectedText" | "latestMessage" | "pageTextSummary" = "selectedText"
): NativeHostMessage {
  if (!tab.url) {
    throw new Error("Active tab does not have a URL.");
  }

  if (!text.trim()) {
    throw new Error("No selected text was found.");
  }

  return {
    ...buildExtensionMetadata(),
    type: "capture",
    sentAt,
    captureType,
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

export function buildBrowserTabsDiscoveredMessage(
  tabs: Array<ActiveTabSnapshot & { active?: boolean | undefined }>,
  permissionMode: "allTabs" | "activeTab",
  sentAt = new Date().toISOString()
): NativeHostMessage {
  const discoveredTabs = tabs
    .filter((tab) => typeof tab.url === "string" && tab.url.trim().length > 0)
    .map((tab) => ({
      kind: "browserTab" as const,
      browser: "chrome" as const,
      ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
      ...(typeof tab.windowId === "number" ? { windowId: tab.windowId } : {}),
      title: tab.title ?? "",
      url: tab.url ?? "",
      ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
      ...(typeof tab.active === "boolean" ? { active: tab.active } : {})
    }));

  return {
    ...buildExtensionMetadata(),
    type: "browserTabsDiscovered",
    sentAt,
    permissionMode,
    tabs: discoveredTabs
  };
}
