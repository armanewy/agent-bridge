import {
  buildBindSourceMessage,
  buildBrowserTabsDiscoveredMessage,
  buildCaptureMessage,
  buildHealthCheckMessage,
  type ExtensionMessage,
  type NativeHostMessage
} from "./protocol.js";
import { extractLatestChatGptAssistantMessage } from "./page-adapters/chatgpt.js";

const nativeHostName = "com.agentbridge.native_host";

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "capture-selection") {
    return;
  }
  handleMessage({ type: "ui.captureSelection" }).catch(() => {
    // The popup remains the visible error surface; keyboard capture is intentionally silent on failure.
  });
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "ui.healthCheck":
      return sendNative(buildHealthCheckMessage());
    case "ui.bindCurrentTab": {
      const tab = await getActiveTab();
      return sendNative(buildBindSourceMessage(tab));
    }
    case "ui.discoverTabs": {
      const { tabs, permissionMode } = await discoverTabs();
      return sendNative(buildBrowserTabsDiscoveredMessage(tabs, permissionMode));
    }
    case "ui.captureSelection": {
      const tab = await getActiveTab();
      if (typeof tab.id !== "number") {
        throw new Error("No active tab is available for capture.");
      }
      const selectedText = await captureSelectedText(tab.id);
      return sendNative(buildCaptureMessage(tab, selectedText));
    }
    case "ui.captureLatestMessage": {
      const tab = await getActiveTab();
      if (typeof tab.id !== "number") {
        throw new Error("No active tab is available for capture.");
      }
      const latestMessage = await captureLatestMessage(tab.id);
      return sendNative(buildCaptureMessage(tab, latestMessage, new Date().toISOString(), "latestMessage"));
    }
  }
}

async function discoverTabs(): Promise<{ tabs: chrome.tabs.Tab[]; permissionMode: "allTabs" | "activeTab" }> {
  const hasTabsPermission = await chrome.permissions.contains({ permissions: ["tabs"] });
  const granted = hasTabsPermission || (await chrome.permissions.request({ permissions: ["tabs"] }));

  if (granted) {
    return {
      tabs: (await chrome.tabs.query({})).filter(isChatGptTab),
      permissionMode: "allTabs"
    };
  }

  return {
    tabs: [await getActiveTab()].filter(isChatGptTab),
    permissionMode: "activeTab"
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) {
    throw new Error("No active tab is available.");
  }
  return tab;
}

async function captureSelectedText(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection()?.toString() ?? ""
  });
  const text = results[0]?.result ?? "";

  if (!text.trim()) {
    throw new Error("No selected text found. Select text on the page and try again.");
  }

  return text;
}

async function captureLatestMessage(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractLatestChatGptAssistantMessage
  });
  const result = results[0]?.result;

  if (!result?.ok || !result.text?.trim()) {
    throw new Error("Latest-message capture is unavailable for this page. Select text and capture the selection instead.");
  }

  return result.text;
}

async function sendNative(message: NativeHostMessage): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(nativeHostName, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        resolve({ ok: false, error: lastError.message ?? "Native host unavailable." });
        return;
      }
      resolve(response ?? { ok: true });
    });
  });
}

function isChatGptTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) {
    return false;
  }
  try {
    const host = new URL(tab.url).hostname.toLowerCase();
    return host === "chatgpt.com" || host === "chat.openai.com" || host.endsWith(".chatgpt.com");
  } catch {
    return false;
  }
}
