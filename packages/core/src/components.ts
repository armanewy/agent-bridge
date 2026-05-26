import type {
  BrowserTabSource,
  CodexThreadRef,
  CodexDeepLinkTarget,
  ComponentProvider,
  DesktopAppSession,
  LinkableComponent,
  LinkableComponentKind,
  RepoContextPack,
  TargetEndpoint,
  WindowsDesktopWindowTarget
} from "./types.js";

const emptyCapabilities = {
  canBeSource: false,
  canBeTarget: false,
  canBeWorkspace: false,
  canCapture: false,
  canDeliver: false,
  canVerify: false,
  canObserve: false,
  canListSessions: false,
  canReadSelectedText: false,
  canReadLatestMessage: false,
  canResumeThread: false,
  canStartTurn: false
};

export function classifyBrowserProvider(url: string): ComponentProvider {
  const hostname = safeHostname(url);
  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    return "chatgpt";
  }
  if (hostname.endsWith("claude.ai")) {
    return "claude";
  }
  if (hostname === "gemini.google.com") {
    return "gemini";
  }
  if (hostname.endsWith("github.com")) {
    return "github";
  }
  return "browser";
}

export function classifyDesktopApp(input: { title?: string | undefined; executablePath?: string | undefined; className?: string | undefined }): {
  provider: ComponentProvider;
  kind: LinkableComponentKind;
  riskLevel: LinkableComponent["riskLevel"];
} {
  const haystack = `${input.title ?? ""} ${input.executablePath ?? ""} ${input.className ?? ""}`.toLowerCase();
  if (haystack.includes("chatgpt")) {
    return { provider: "chatgptDesktop", kind: "chatgptDesktop", riskLevel: "medium" };
  }
  if (haystack.includes("codex")) {
    return { provider: "codexDesktop", kind: "codexDesktop", riskLevel: "low" };
  }
  if (haystack.includes("code.exe") || haystack.includes("visual studio code") || haystack.includes("vscode")) {
    return { provider: "vscode", kind: "ide", riskLevel: "medium" };
  }
  if (haystack.includes("cursor")) {
    return { provider: "cursor", kind: "ide", riskLevel: "medium" };
  }
  if (haystack.includes("windowsterminal") || haystack.includes("powershell") || haystack.includes("cmd.exe")) {
    return { provider: "terminal", kind: "terminal", riskLevel: "high" };
  }
  return { provider: "unknown", kind: "desktopWindow", riskLevel: "medium" };
}

export function chatGptDesktopSessionComponent(session: DesktopAppSession, discoveredAt = session.discoveredAt): LinkableComponent {
  const title = session.sessionTitle ?? session.windowTitle ?? "ChatGPT Desktop";
  return {
    id: `component_chatgpt_desktop_${session.fingerprint}`,
    kind: "chatgptDesktop",
    label: title,
    subtitle: session.windowTitle ?? session.executablePath ?? "Current ChatGPT desktop conversation candidate",
    provider: "chatgptDesktop",
    roleCapabilities: {
      ...emptyCapabilities,
      canBeSource: true,
      canCapture: session.capabilities.canReadSelectedText || session.capabilities.canReadLatestMessage,
      canReadSelectedText: session.capabilities.canReadSelectedText,
      canReadLatestMessage: session.capabilities.canReadLatestMessage,
      canListSessions: session.capabilities.canListSessions
    },
    riskLevel: session.confidence === "low" ? "medium" : "low",
    status: session.capabilities.canReadSelectedText || session.capabilities.canReadLatestMessage ? "available" : "unsupported",
    compatibilityScore: session.confidence === "high" ? 88 : session.confidence === "medium" ? 72 : 42,
    backingRef: {
      ...(session.hwnd ? { hwnd: session.hwnd } : {}),
      ...(session.processId ? { processId: session.processId } : {}),
      ...(session.sessionId ? { sessionId: session.sessionId } : {})
    },
    metadata: {
      provider: session.provider,
      appKind: session.appKind,
      fingerprint: session.fingerprint,
      confidence: session.confidence,
      capabilities: session.capabilities,
      ...(session.windowTitle ? { windowTitle: session.windowTitle } : {}),
      ...(session.sessionTitle ? { sessionTitle: session.sessionTitle } : {}),
      ...(session.executablePath ? { executablePath: session.executablePath } : {})
    },
    discoveredAt,
    updatedAt: session.updatedAt
  };
}

export function browserTabComponent(source: BrowserTabSource, discoveredAt = source.boundAt): LinkableComponent {
  const provider = classifyBrowserProvider(source.url);
  const isKnownProvider = provider !== "browser";

  return {
    id: `component_source_${source.id}`,
    kind: "browserTab",
    label: source.title || providerLabel(provider),
    subtitle: safeHostname(source.url) || source.url,
    provider,
    roleCapabilities: {
      ...emptyCapabilities,
      canBeSource: true,
      canCapture: true
    },
    riskLevel: "low",
    status: "available",
    compatibilityScore: isKnownProvider ? 90 : 72,
    backingRef: {
      sourceId: source.id,
      ...(typeof source.tabId === "number" ? { tabId: source.tabId } : {}),
      ...(typeof source.windowId === "number" ? { windowId: source.windowId } : {})
    },
    metadata: {
      url: source.url,
      title: source.title,
      ...(source.favIconUrl ? { favIconUrl: source.favIconUrl } : {})
    },
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function codexThreadComponent(
  thread: CodexThreadRef,
  options: { targetId?: string; discoveredAt?: string } = {}
): LinkableComponent {
  const integrationMode = thread.source === "appServer" ? "appServer" : thread.source === "sdk" ? "sdk" : "deepLink";
  return {
    id: `component_codex_thread_${thread.threadId}`,
    kind: "codexThread",
    label: thread.name ?? `Codex thread ${shortId(thread.threadId)}`,
    subtitle: thread.repoPath ?? "Existing Codex thread",
    provider: "codexThread",
    roleCapabilities: {
      ...emptyCapabilities,
      canBeTarget: true,
      canDeliver: true,
      canResumeThread: integrationMode === "appServer" || integrationMode === "sdk",
      canStartTurn: integrationMode === "appServer" || integrationMode === "sdk",
      canObserve: integrationMode === "appServer"
    },
    riskLevel: "low",
    status: "available",
    compatibilityScore: integrationMode === "appServer" ? 98 : 76,
    backingRef: {
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(thread.repoPath ? { repoPath: thread.repoPath } : {}),
      codexThreadId: thread.threadId
    },
    metadata: {
      threadId: thread.threadId,
      source: thread.source,
      status: thread.status ?? "unknown",
      integrationMode,
      openMode: "existingThread",
      lastSeenAt: thread.lastSeenAt,
      ...(thread.name ? { name: thread.name } : {})
    },
    discoveredAt: options.discoveredAt ?? thread.lastSeenAt,
    updatedAt: thread.lastSeenAt
  };
}

export function repoComponent(repoContext: RepoContextPack, idSuffix: string, discoveredAt = new Date().toISOString()): LinkableComponent {
  const status = repoContext.gitStatusSummary ?? "repo";

  return {
    id: `component_repo_${idSuffix}`,
    kind: "repo",
    label: repoContext.repoName ?? repoContext.repoPath,
    subtitle: `${repoContext.currentBranch ?? "branch unknown"} · ${status}`,
    provider: "repo",
    roleCapabilities: {
      ...emptyCapabilities,
      canBeWorkspace: true,
      canVerify: true
    },
    riskLevel: "low",
    status: "available",
    compatibilityScore: repoContext.testCommand || repoContext.lintCommand || repoContext.typecheckCommand ? 92 : 82,
    backingRef: {
      repoPath: repoContext.repoPath
    },
    metadata: repoContext,
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function targetComponent(target: TargetEndpoint, discoveredAt = new Date().toISOString()): LinkableComponent {
  if (target.kind === "codexDeepLink") {
    return codexTargetComponent(target, discoveredAt);
  }
  if (target.kind === "windowsDesktopWindow") {
    return desktopWindowComponent(target, discoveredAt);
  }
  return {
    id: `component_target_${target.parentTargetId}_clipboard`,
    kind: "desktopWindow",
    label: "Clipboard fallback",
    subtitle: "Requires explicit approval",
    provider: "unknown",
    roleCapabilities: {
      ...emptyCapabilities,
      canBeTarget: true,
      canDeliver: true
    },
    riskLevel: "high",
    status: "permission_needed",
    compatibilityScore: 35,
    backingRef: {
      targetId: target.parentTargetId
    },
    metadata: { kind: target.kind },
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function codexTargetComponent(target: CodexDeepLinkTarget, discoveredAt = target.boundAt): LinkableComponent {
  return {
    id: `component_target_${target.id}`,
    kind: "agentTarget",
    label: "Codex",
    subtitle: "Official deep-link target",
    provider: "codex",
    roleCapabilities: {
      ...emptyCapabilities,
      canBeTarget: true,
      canDeliver: true
    },
    riskLevel: "low",
    status: "available",
    compatibilityScore: 96,
    backingRef: {
      targetId: target.id,
      repoPath: target.repoPath
    },
    metadata: {
      delivery: "codex://",
      repoPath: target.repoPath,
      openMode: target.openMode,
      integrationMode: target.integrationMode ?? "deepLink",
      ...(target.existingThreadId ? { existingThreadId: target.existingThreadId } : {}),
      ...(target.existingThreadName ? { existingThreadName: target.existingThreadName } : {})
    },
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function desktopWindowComponent(target: WindowsDesktopWindowTarget, discoveredAt = target.boundAt): LinkableComponent {
  const classification = classifyDesktopApp(target);
  const isTerminal = classification.provider === "terminal";

  return {
    id: `component_window_${target.hwnd}`,
    kind: classification.kind,
    label: target.title || providerLabel(classification.provider),
    subtitle: target.executablePath ?? `HWND ${target.hwnd}`,
    provider: classification.provider,
    roleCapabilities: {
      ...emptyCapabilities,
      canBeTarget: false,
      canDeliver: false
    },
    riskLevel: classification.riskLevel,
    status: isTerminal ? "permission_needed" : classification.provider === "unknown" ? "unsupported" : "available",
    compatibilityScore: scoreDesktopCompatibility(classification.provider),
    backingRef: {
      targetId: target.id,
      hwnd: target.hwnd
    },
    metadata: {
      hwnd: target.hwnd,
      title: target.title,
      processId: target.processId,
      executablePath: target.executablePath,
      className: target.className,
      preferredDelivery: classification.provider === "codexDesktop" ? "codexDeepLink" : "detectOnly"
    },
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function componentStatusLabel(component: LinkableComponent): string {
  if (component.riskLevel === "high") {
    return "High risk";
  }
  if (component.status === "permission_needed") {
    return "Needs permission";
  }
  if (component.status === "unsupported") {
    return "Unsupported";
  }
  if (component.roleCapabilities.canCapture && component.roleCapabilities.canBeSource) {
    return "Capture ready";
  }
  if (component.roleCapabilities.canDeliver && component.roleCapabilities.canBeTarget) {
    return "Send ready";
  }
  if (component.roleCapabilities.canVerify && component.roleCapabilities.canBeWorkspace) {
    return "Verify ready";
  }
  return "Detected";
}

export function providerLabel(provider: ComponentProvider): string {
  return {
    chatgpt: "ChatGPT",
    chatgptDesktop: "ChatGPT Desktop",
    claude: "Claude",
    gemini: "Gemini",
    github: "GitHub",
    codex: "Codex",
    codexDesktop: "Codex Desktop",
    codexThread: "Codex Thread",
    vscode: "VS Code",
    cursor: "Cursor",
    terminal: "Terminal",
    repo: "Repo",
    browser: "Browser tab",
    unknown: "Unknown"
  }[provider];
}

function scoreDesktopCompatibility(provider: ComponentProvider): number {
  if (provider === "codexDesktop") {
    return 88;
  }
  if (provider === "chatgptDesktop") {
    return 72;
  }
  if (provider === "vscode" || provider === "cursor") {
    return 58;
  }
  if (provider === "terminal") {
    return 28;
  }
  return 34;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
