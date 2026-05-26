import { buildBindSourceMessage, buildCaptureMessage, type ExtensionMessage, type NativeHostMessage } from "./protocol.js";

const nativeHostName = "com.agentbridge.native_host";

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "ui.healthCheck":
      return sendNative({ type: "healthCheck", sentAt: new Date().toISOString() });
    case "ui.bindCurrentTab": {
      const tab = await getActiveTab();
      return sendNative(buildBindSourceMessage(tab));
    }
    case "ui.captureSelection": {
      const tab = await getActiveTab();
      if (typeof tab.id !== "number") {
        throw new Error("No active tab is available for capture.");
      }
      const selectedText = await captureSelectedText(tab.id);
      return sendNative(buildCaptureMessage(tab, selectedText));
    }
  }
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
