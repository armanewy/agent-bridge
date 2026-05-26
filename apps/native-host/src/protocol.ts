import { randomUUID } from "node:crypto";
import { browserTabComponent } from "@agentbridge/core";
import type { BrowserTabSource, Capture, LinkableComponent } from "@agentbridge/core";

export type NativeHostRequest =
  | { type: "healthCheck"; sentAt?: string }
  | {
      type: "bindSource";
      sentAt?: string;
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
      sentAt?: string;
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
      sentAt?: string;
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
    };

export interface NativeHostResponse {
  ok: boolean;
  type: string;
  error?: string;
  source?: BrowserTabSource;
  capture?: Capture;
  components?: LinkableComponent[];
  receivedAt: string;
}

export async function handleNativeHostMessage(
  message: unknown,
  options: { appendLog?: (entry: unknown) => Promise<void>; now?: () => string } = {}
): Promise<NativeHostResponse> {
  const now = options.now ?? (() => new Date().toISOString());
  const receivedAt = now();

  if (!isRecord(message) || typeof message.type !== "string") {
    return { ok: false, type: "unknown", error: "Message must include a string type.", receivedAt };
  }

  switch (message.type) {
    case "healthCheck":
      await options.appendLog?.({ type: "healthCheck", receivedAt });
      return { ok: true, type: "healthCheck", receivedAt };
    case "bindSource": {
      const source = createBrowserTabSource(message, receivedAt);
      await options.appendLog?.({ type: "bindSource", source, receivedAt });
      return { ok: true, type: "bindSource", source, receivedAt };
    }
    case "browserTabsDiscovered": {
      const components = createBrowserTabComponents(message, receivedAt);
      await options.appendLog?.({ type: "browserTabsDiscovered", count: components.length, receivedAt });
      return { ok: true, type: "browserTabsDiscovered", components, receivedAt };
    }
    case "capture": {
      const capture = createCapture(message, receivedAt);
      await options.appendLog?.({ type: "capture", capture, receivedAt });
      return { ok: true, type: "capture", capture, receivedAt };
    }
    default:
      return { ok: false, type: message.type, error: `Unsupported message type: ${message.type}`, receivedAt };
  }
}

function createBrowserTabComponents(message: Record<string, unknown>, discoveredAt: string): LinkableComponent[] {
  const tabs = Array.isArray(message.tabs) ? message.tabs : [];
  return tabs
    .filter(isRecord)
    .map((tab) => createBrowserTabSource({ source: tab }, discoveredAt))
    .map((source) => {
      const component = browserTabComponent(source, discoveredAt);
      return {
        ...component,
        metadata: {
          ...component.metadata,
          permissionMode: message.permissionMode === "allTabs" ? "allTabs" : "activeTab"
        }
      };
    });
}

function createBrowserTabSource(message: Record<string, unknown>, boundAt: string): BrowserTabSource {
  const source = expectRecord(message.source, "source");
  const url = expectString(source.url, "source.url");

  return {
    id: `src_${randomUUID()}`,
    kind: "browserTab",
    browser: "chrome",
    ...(typeof source.tabId === "number" ? { tabId: source.tabId } : {}),
    ...(typeof source.windowId === "number" ? { windowId: source.windowId } : {}),
    title: typeof source.title === "string" ? source.title : "",
    url,
    ...(typeof source.favIconUrl === "string" ? { favIconUrl: source.favIconUrl } : {}),
    boundAt
  };
}

function createCapture(message: Record<string, unknown>, createdAt: string): Capture {
  const source = createBrowserTabSource(message, createdAt);
  const text = expectString(message.text, "text").trim();

  if (!text) {
    throw new Error("Capture text cannot be empty.");
  }

  if (message.userTriggered !== true) {
    throw new Error("Capture must be user-triggered.");
  }

  return {
    id: `cap_${randomUUID()}`,
    sourceId: source.id,
    captureType: message.captureType === "pageTextSummary" || message.captureType === "latestMessage" ? message.captureType : "selectedText",
    text,
    metadata: {
      source,
      receivedFrom: "chromeExtension"
    },
    createdAt,
    userTriggered: true
  };
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
