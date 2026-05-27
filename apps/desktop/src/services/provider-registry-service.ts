import type {
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  ExecutorProvider
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export class ProviderRegistryService {
  private readonly providers = new Map<string, ExecutorProvider>();

  constructor(private readonly store: LocalStore) {}

  registerProvider(provider: ExecutorProvider): void {
    this.providers.set(provider.profile().id, provider);
  }

  async listProviderProfiles(): Promise<AgentProviderProfile[]> {
    const profiles = await Promise.all(defaultProviderProfiles().map((profile) => this.resolveProfile(profile.id)));
    const registered = await Promise.all([...this.providers.keys()].map((providerId) => this.resolveProfile(providerId)));
    const merged = mergeProfiles([...profiles, ...registered].filter((profile): profile is AgentProviderProfile => Boolean(profile)));
    for (const profile of merged) {
      await this.store.saveProviderProfile(profile);
    }
    return merged;
  }

  async getProviderStatus(providerId: string): Promise<AgentProviderProfile | undefined> {
    const profile = await this.resolveProfile(providerId);
    if (profile) {
      await this.store.saveProviderProfile(profile);
    }
    return profile;
  }

  async listSessions(providerId?: string): Promise<AgentSessionRef[]> {
    const stored = await this.store.listAgentSessions(providerId);
    const provider = providerId ? this.providers.get(providerId) : undefined;
    if (!provider || !hasListSessions(provider)) {
      return stored;
    }
    const discovered = await provider.listSessions();
    for (const session of discovered) {
      await this.store.saveAgentSession(session);
    }
    return mergeSessions([...stored, ...discovered]);
  }

  async createSession(
    providerId: string,
    input: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<AgentSessionRef> {
    const provider = this.providers.get(providerId);
    if (!provider || !hasCreateSession(provider)) {
      throw new Error(`Provider ${providerId} cannot create sessions yet.`);
    }
    const session = await provider.createSession(input);
    await this.store.saveAgentSession(session);
    return session;
  }

  async resumeSession(providerId: string, sessionId: string): Promise<AgentSessionRef> {
    const provider = this.providers.get(providerId);
    const session = await this.store.getAgentSession(sessionId);
    if (!session) {
      throw new Error(`Agent session ${sessionId} was not found.`);
    }
    if (!provider || !hasResumeSession(provider)) {
      throw new Error(`Provider ${providerId} cannot resume sessions yet.`);
    }
    const resumed = await provider.resumeSession(session);
    await this.store.saveAgentSession(resumed);
    return resumed;
  }

  private async resolveProfile(providerId: string): Promise<AgentProviderProfile | undefined> {
    const provider = this.providers.get(providerId);
    if (provider) {
      return provider.status();
    }
    return defaultProviderProfiles().find((profile) => profile.id === providerId) ?? this.store.getProviderProfile(providerId);
  }
}

export function defaultProviderProfiles(): AgentProviderProfile[] {
  return [
    {
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canUseRepo", "canListSessions", "canCreateSession", "canResumeSession", "canSendMessage"],
      authMode: "appServer",
      status: "unavailable",
      artifactCapabilities: {
        canAcceptTextArtifacts: true,
        canAcceptFileInputs: false,
        canAcceptFilePaths: false,
        canReturnTextArtifacts: true,
        canReturnFileArtifacts: false,
        canReturnDiffs: false,
        canReturnLogs: false,
        canReturnScreenshots: false,
        acceptedMimeTypes: ["text/plain", "text/markdown", "application/json"]
      },
      metadata: {
        adapter: "placeholder",
        reason: "Codex executor uses the current local delivery services."
      }
    }
  ];
}

function mergeProfiles(profiles: AgentProviderProfile[]): AgentProviderProfile[] {
  const byId = new Map<string, AgentProviderProfile>();
  for (const profile of profiles) {
    byId.set(profile.id, profile);
  }
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function mergeSessions(sessions: AgentSessionRef[]): AgentSessionRef[] {
  const byId = new Map<string, AgentSessionRef>();
  for (const session of sessions) {
    byId.set(session.id, session);
  }
  return [...byId.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function hasListSessions(provider: ExecutorProvider): provider is ExecutorProvider {
  return typeof provider.listSessions === "function";
}

function hasCreateSession(provider: ExecutorProvider): provider is ExecutorProvider {
  return typeof provider.createSession === "function";
}

function hasResumeSession(provider: ExecutorProvider): provider is ExecutorProvider {
  return typeof provider.resumeSession === "function";
}
