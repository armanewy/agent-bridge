import type {
  CodexThreadRef,
  ComponentProvider,
  LinkableComponent,
  LinkableComponentKind,
  RepoContextPack,
  TargetEndpoint,
  WindowsDesktopWindowTarget
} from "./types.js";

const emptyCapabilities = {
  canBeTarget: false,
  canBeWorkspace: false,
  canDeliver: false,
  canVerify: false,
  canObserve: false,
  canListSessions: false,
  canReadSelectedText: false,
  canReadLatestMessage: false,
  canResumeThread: false,
  canStartTurn: false
};

export function classifyDesktopApp(input: { title?: string | undefined; executablePath?: string | undefined; className?: string | undefined }): {
  provider: ComponentProvider;
  kind: LinkableComponentKind;
  riskLevel: LinkableComponent["riskLevel"];
} {
  const haystack = `${input.title ?? ""} ${input.executablePath ?? ""} ${input.className ?? ""}`.toLowerCase();
  if (haystack.includes("chatgpt")) {
    return { provider: "chatgpt", kind: "desktopWindow", riskLevel: "medium" };
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

export function codexThreadComponent(
  thread: CodexThreadRef,
  options: { targetId?: string; discoveredAt?: string } = {}
): LinkableComponent {
  const integrationMode = "appServer";
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
      canResumeThread: true,
      canStartTurn: true,
      canObserve: true
    },
    riskLevel: "low",
    status: "available",
    fitScore: 98,
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
    fitScore: repoContext.testCommand || repoContext.lintCommand || repoContext.typecheckCommand ? 92 : 82,
    backingRef: {
      repoPath: repoContext.repoPath
    },
    metadata: repoContext,
    discoveredAt,
    updatedAt: discoveredAt
  };
}

export function targetComponent(target: TargetEndpoint, discoveredAt = new Date().toISOString()): LinkableComponent {
  return desktopWindowComponent(target, discoveredAt);
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
    fitScore: scoreDesktopFit(classification.provider),
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
      preferredDelivery: classification.provider === "codexDesktop" ? "codexAppServer" : "detectOnly"
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
    unknown: "Unknown"
  }[provider];
}

function scoreDesktopFit(provider: ComponentProvider): number {
  if (provider === "codexDesktop") {
    return 88;
  }
  if (provider === "chatgpt") {
    return 44;
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
