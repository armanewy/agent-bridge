import type { ExtensionMessage } from "./protocol.js";

const statusElement = document.querySelector<HTMLDivElement>("#status");
const connectionElement = document.querySelector<HTMLDivElement>("#connection");
const activeTabElement = document.querySelector<HTMLParagraphElement>("#active-tab");
const diagnosticsElement = document.querySelector<HTMLDivElement>("#diagnostics");
const chatGptActions = document.querySelector<HTMLElement>("#chatgpt-actions");
const notChatGpt = document.querySelector<HTMLElement>("#not-chatgpt");

let lastError = "";
let lastResponse: unknown;

void initialize();

document.querySelector<HTMLButtonElement>("#sync")?.addEventListener("click", () => {
  void run({ type: "ui.bindCurrentTab" }, "Synced this ChatGPT tab with AgentBridge.");
});

document.querySelector<HTMLButtonElement>("#show-all")?.addEventListener("click", () => {
  void run({ type: "ui.discoverTabs" }, "Synced visible ChatGPT tabs with AgentBridge.");
});

document.querySelector<HTMLButtonElement>("#capture")?.addEventListener("click", () => {
  void run({ type: "ui.captureSelection" }, "Captured selected text.");
});

document.querySelector<HTMLButtonElement>("#latest")?.addEventListener("click", () => {
  void run({ type: "ui.captureLatestMessage" }, "Captured latest answer.");
});

document.querySelector<HTMLButtonElement>("#health")?.addEventListener("click", () => {
  void checkConnection();
});

async function initialize(): Promise<void> {
  await Promise.all([checkConnection(), renderActiveTab()]);
  renderDiagnostics();
}

async function renderActiveTab(): Promise<void> {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const hostname = tab?.url ? safeHostname(tab.url) : undefined;
  const isChatGpt = hostname === "chatgpt.com" || hostname === "chat.openai.com" || hostname?.endsWith(".chatgpt.com");

  if (activeTabElement) {
    activeTabElement.textContent = tab?.title ? `${tab.title}${hostname ? ` · ${hostname}` : ""}` : "No active tab detected.";
  }
  if (chatGptActions) {
    chatGptActions.hidden = !isChatGpt;
  }
  if (notChatGpt) {
    notChatGpt.hidden = Boolean(isChatGpt);
  }
}

async function checkConnection(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: "ui.healthCheck" } satisfies ExtensionMessage);
  lastResponse = response;
  if (response?.ok === false) {
    lastError = response.error ?? "Desktop app is not connected.";
    setConnection(false, "Desktop app: not connected");
    setStatus(lastError);
    renderDiagnostics();
    return;
  }
  lastError = "";
  setConnection(true, "Desktop app: connected");
  setStatus("Desktop connection is ready.");
  renderDiagnostics();
}

async function run(message: ExtensionMessage, successMessage: string): Promise<void> {
  setStatus("Working...");
  const response = await chrome.runtime.sendMessage(message);
  lastResponse = response;

  if (response?.ok === false) {
    lastError = response.error ?? "AgentBridge desktop app is unavailable.";
    setStatus(lastError);
    setConnection(false, "Desktop app: not connected");
    renderDiagnostics();
    return;
  }

  lastError = "";
  setConnection(true, "Desktop app: connected");
  setStatus(successMessage);
  renderDiagnostics();
}

function setStatus(value: string): void {
  if (statusElement) {
    statusElement.textContent = value;
  }
}

function setConnection(ok: boolean, value: string): void {
  if (!connectionElement) {
    return;
  }
  connectionElement.textContent = value;
  connectionElement.className = ok ? "status-line status-ok" : "status-line status-bad";
}

function renderDiagnostics(): void {
  if (!diagnosticsElement) {
    return;
  }
  diagnosticsElement.textContent = JSON.stringify(
    {
      extensionId: chrome.runtime.id,
      extensionVersion: chrome.runtime.getManifest().version,
      permissionMode: "activeTab-by-default",
      lastError,
      lastResponse
    },
    null,
    2
  );
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
