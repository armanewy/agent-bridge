import type {
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  ExecutorProvider,
  PlannerProvider,
  PlannerRequest,
  ReviewerProvider
} from "@agentbridge/core";
import type { AgentEventFilter, LocalStore } from "@agentbridge/local-store";

type ProviderAdapter = PlannerProvider | ExecutorProvider | ReviewerProvider;

export class ProviderRegistryService {
  private readonly providers = new Map<string, ProviderAdapter>();

  constructor(private readonly store: LocalStore) {}

  registerProvider(provider: ProviderAdapter): void {
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
    return this.store.listAgentSessions(providerId);
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

  async sendMessage(
    providerId: string,
    sessionId: string,
    message: string,
    context?: PlannerRequest
  ): Promise<AgentTurn> {
    const provider = this.providers.get(providerId);
    const session = await this.store.getAgentSession(sessionId);
    if (!session) {
      throw new Error(`Agent session ${sessionId} was not found.`);
    }
    if (!provider || !hasSendMessage(provider)) {
      throw new Error(`Provider ${providerId} cannot send messages yet.`);
    }
    const turn = await provider.sendMessage(session, message, context);
    await this.store.saveAgentTurn(turn);
    return turn;
  }

  async listTurns(sessionRefId: string): Promise<AgentTurn[]> {
    return this.store.listAgentTurns(sessionRefId);
  }

  async listEvents(filter: AgentEventFilter = {}): Promise<AgentEvent[]> {
    return this.store.listAgentEvents(filter);
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
  const plannerHasKey = Boolean(process.env.AGENTBRIDGE_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  return [
    {
      id: "openai-planner",
      kind: "planner",
      displayName: "OpenAI Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "apiKey",
      status: plannerHasKey ? "unavailable" : "needsAuth",
      metadata: {
        adapter: "placeholder",
        reason: plannerHasKey ? "Planner adapter is not implemented yet." : "Set AGENTBRIDGE_OPENAI_API_KEY or OPENAI_API_KEY."
      }
    },
    {
      id: "codex",
      kind: "executor",
      displayName: "Codex",
      capabilities: ["canExecuteCode", "canUseRepo", "canListSessions", "canCreateSession", "canResumeSession", "canSendMessage"],
      authMode: "appServer",
      status: "unavailable",
      metadata: {
        adapter: "placeholder",
        reason: "Codex Executor provider wrapper is not implemented yet; legacy Codex services remain available."
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

function hasCreateSession(provider: ProviderAdapter): provider is PlannerProvider | ExecutorProvider {
  return typeof (provider as PlannerProvider | ExecutorProvider).createSession === "function";
}

function hasResumeSession(provider: ProviderAdapter): provider is PlannerProvider | ExecutorProvider {
  return typeof (provider as PlannerProvider | ExecutorProvider).resumeSession === "function";
}

function hasSendMessage(provider: ProviderAdapter): provider is PlannerProvider {
  return typeof (provider as PlannerProvider).sendMessage === "function";
}
