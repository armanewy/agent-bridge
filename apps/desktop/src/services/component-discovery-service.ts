import { createHash } from "node:crypto";
import {
  browserTabComponent,
  chatGptDesktopSessionComponent,
  codexThreadComponent,
  desktopWindowComponent,
  repoComponent,
  targetComponent,
  type LinkableComponent
} from "@agentbridge/core";
import type { DesktopAppSession, WindowsDesktopWindowTarget } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import { RepoContextService } from "./repo-context-service.js";
import type { WindowsTargetService } from "./windows-target-service.js";

export interface ComponentDiscoveryResult {
  components: LinkableComponent[];
  warnings: string[];
}

export class ComponentDiscoveryService {
  private readonly repoContextService: RepoContextService;

  constructor(
    private readonly store: LocalStore,
    private readonly windowsTargetService: WindowsTargetService
  ) {
    this.repoContextService = new RepoContextService(store);
  }

  async listComponents(): Promise<LinkableComponent[]> {
    const [stored, derived] = await Promise.all([
      this.store.listLinkableComponents(),
      this.deriveStoredComponents()
    ]);
    const storedIds = new Set(stored.map((component) => component.id));
    for (const component of derived) {
      if (!storedIds.has(component.id)) {
        await this.store.saveLinkableComponent(component);
      }
    }
    return mergeComponents([...stored, ...derived]);
  }

  async discover(): Promise<ComponentDiscoveryResult> {
    const warnings: string[] = [];
    const components = await this.deriveStoredComponents();

    try {
      const windows = await this.windowsTargetService.listTopLevelWindows();
      components.push(...windows.map((window) => desktopWindowComponent(window)));
      components.push(...await this.discoverChatGptDesktopSessions(windows));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }

    const merged = mergeComponents(components);
    for (const component of merged) {
      await this.store.saveLinkableComponent(component);
    }

    return { components: merged, warnings };
  }

  private async deriveStoredComponents(): Promise<LinkableComponent[]> {
    const [sources, targets] = await Promise.all([
      this.store.listSources(),
      this.store.listTargets()
    ]);
    const components: LinkableComponent[] = sources
      .filter((source) => source.kind === "browserTab")
      .map((source) => browserTabComponent(source));

    components.push(
      ...sources
        .filter((source) => source.kind === "chatgptDesktop")
        .map((source) => chatGptDesktopSessionComponent(source))
    );

    for (const target of targets) {
      const targetDiscoveredAt = "boundAt" in target ? target.boundAt : new Date().toISOString();
      components.push(targetComponent(target, targetDiscoveredAt));

      if (target.kind === "codexDeepLink") {
        try {
          const repoContext = await this.repoContextService.build(target.repoPath);
          components.push(repoComponent(repoContext, hashId(target.repoPath), target.boundAt));
        } catch {
          components.push({
            id: `component_repo_${hashId(target.repoPath)}`,
            kind: "repo",
            label: target.repoPath,
            subtitle: "Repo path unavailable",
            provider: "repo",
            roleCapabilities: {
              canBeSource: false,
              canBeTarget: false,
              canBeWorkspace: true,
              canCapture: false,
              canDeliver: false,
              canVerify: false,
              canObserve: false
            },
            riskLevel: "medium",
            status: "unavailable",
            compatibilityScore: 20,
            backingRef: { repoPath: target.repoPath },
            metadata: { repoPath: target.repoPath },
            discoveredAt: target.boundAt,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    const codexTargets = targets.filter((target) => target.kind === "codexDeepLink");
    const threadRefs = await this.store.listCodexThreadRefs();
    for (const thread of threadRefs) {
      const matchingTarget = codexTargets.find((target) => normalizePath(target.repoPath) === normalizePath(thread.repoPath));
      components.push(codexThreadComponent(thread, matchingTarget ? { targetId: matchingTarget.id } : {}));
    }

    return components;
  }

  private async discoverChatGptDesktopSessions(windows: WindowsDesktopWindowTarget[]): Promise<LinkableComponent[]> {
    const components: LinkableComponent[] = [];
    const chatGptWindows = windows.filter((window) => looksLikeChatGptDesktop(window));
    for (const window of chatGptWindows) {
      let session = desktopWindowToChatGptSession(window);
      try {
        const inspection = await this.windowsTargetService.inspectChatGptWindow(window.hwnd);
        if (inspection.chatGptProbe) {
          session = {
            ...session,
            sessionTitle: inspection.chatGptProbe.activeConversationTitle ?? session.sessionTitle,
            capabilities: {
              canReadSelectedText: inspection.chatGptProbe.supportsSelectedText,
              canReadLatestMessage: inspection.chatGptProbe.supportsLatestMessage,
              canListSessions: inspection.chatGptProbe.supportsSessionList,
              canSendTurn: false
            },
            confidence: inspection.chatGptProbe.confidence,
            updatedAt: new Date().toISOString()
          };
        }
      } catch {
        // Window discovery should still surface a low-confidence ChatGPT Desktop candidate.
      }
      components.push(chatGptDesktopSessionComponent(session));
    }

    return components;
  }
}

export function mergeComponents(components: LinkableComponent[]): LinkableComponent[] {
  const byId = new Map<string, LinkableComponent>();
  for (const component of components) {
    const previous = byId.get(component.id);
    if (!previous || previous.updatedAt.localeCompare(component.updatedAt) < 0) {
      byId.set(component.id, component);
    }
  }
  return [...byId.values()].sort((a, b) => b.compatibilityScore - a.compatibilityScore || a.label.localeCompare(b.label));
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function desktopWindowToChatGptSession(window: WindowsDesktopWindowTarget): DesktopAppSession {
  const now = new Date().toISOString();
  const fingerprint = hashId(`${window.hwnd}:${window.processId ?? ""}:${window.title}:${window.executablePath ?? ""}`);
  return {
    id: `desktop_session_chatgpt_${fingerprint}`,
    provider: "chatgpt",
    appKind: "desktopApp",
    ...(window.processId ? { processId: window.processId } : {}),
    hwnd: window.hwnd,
    ...(window.executablePath ? { executablePath: window.executablePath } : {}),
    windowTitle: window.title,
    sessionTitle: window.title,
    fingerprint,
    capabilities: {
      canReadSelectedText: false,
      canReadLatestMessage: false,
      canListSessions: false,
      canSendTurn: false
    },
    confidence: "low",
    discoveredAt: now,
    updatedAt: now
  };
}

function looksLikeChatGptDesktop(window: WindowsDesktopWindowTarget): boolean {
  const executable = (window.executablePath ?? "").toLowerCase();
  if (executable.includes("chrome.exe") || executable.includes("msedge.exe") || executable.includes("firefox.exe")) {
    return false;
  }
  return `${window.title} ${window.executablePath ?? ""} ${window.className ?? ""}`.toLowerCase().includes("chatgpt");
}

function normalizePath(value?: string): string {
  return (value ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
