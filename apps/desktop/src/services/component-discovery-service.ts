import { createHash } from "node:crypto";
import {
  codexThreadComponent,
  desktopWindowComponent,
  repoComponent,
  type LinkableComponent
} from "@agentbridge/core";
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
    const components: LinkableComponent[] = [];
    const threadRefs = await this.store.listCodexThreadRefs();
    for (const thread of threadRefs) {
      components.push(codexThreadComponent(thread));
      if (thread.repoPath) {
        try {
          const repoContext = await this.repoContextService.build(thread.repoPath);
          components.push(repoComponent(repoContext, hashId(thread.repoPath), thread.lastSeenAt));
        } catch {
          components.push({
            id: `component_repo_${hashId(thread.repoPath)}`,
            kind: "repo",
            label: thread.repoPath,
            subtitle: "Repo path unavailable",
            provider: "repo",
            roleCapabilities: {
              canBeTarget: false,
              canBeWorkspace: true,
              canDeliver: false,
              canVerify: false,
              canObserve: false
            },
            riskLevel: "medium",
            status: "unavailable",
            fitScore: 20,
            backingRef: { repoPath: thread.repoPath },
            metadata: { repoPath: thread.repoPath },
            discoveredAt: thread.lastSeenAt,
            updatedAt: new Date().toISOString()
          });
        }
      }
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
  return [...byId.values()].sort((a, b) => b.fitScore - a.fitScore || a.label.localeCompare(b.label));
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}
