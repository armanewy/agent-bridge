import type { ExtensionMessage } from "./protocol.js";

const statusElement = document.querySelector<HTMLDivElement>("#status");

document.querySelector<HTMLButtonElement>("#bind")?.addEventListener("click", () => {
  void run({ type: "ui.bindCurrentTab" }, "Bound current tab.");
});

document.querySelector<HTMLButtonElement>("#discover")?.addEventListener("click", () => {
  void run({ type: "ui.discoverTabs" }, "Sent linkable tabs to AgentBridge.");
});

document.querySelector<HTMLButtonElement>("#capture")?.addEventListener("click", () => {
  void run({ type: "ui.captureSelection" }, "Captured selected text.");
});

document.querySelector<HTMLButtonElement>("#latest")?.addEventListener("click", () => {
  void run({ type: "ui.captureLatestMessage" }, "Captured latest assistant message.");
});

document.querySelector<HTMLButtonElement>("#health")?.addEventListener("click", () => {
  void run({ type: "ui.healthCheck" }, "Native host responded.");
});

async function run(message: ExtensionMessage, successMessage: string): Promise<void> {
  setStatus("Working...");
  const response = await chrome.runtime.sendMessage(message);

  if (response?.ok === false) {
    setStatus(response.error ?? "AgentBridge native host is unavailable.");
    return;
  }

  setStatus(successMessage);
}

function setStatus(value: string): void {
  if (statusElement) {
    statusElement.textContent = value;
  }
}
