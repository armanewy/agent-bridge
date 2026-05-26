import type {
  AgentEvent,
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  ExecutorProvider,
  PlannerProviderMode,
  PlannerProvider,
  PlannerResponse,
  PlannerRequest,
  ReviewerProvider,
  ReviewRequest,
  ReviewResult
} from "@agentbridge/core";
import type { AgentEventFilter, LocalStore } from "@agentbridge/local-store";

type ProviderAdapter = PlannerProvider | ExecutorProvider | ReviewerProvider;

export interface PlannerModeInfo {
  mode: PlannerProviderMode;
  providerId: string;
  label: string;
  default: boolean;
  advanced: boolean;
  status: "available" | "needsAuth" | "unavailable" | "unsupported";
  description: string;
}

export class ProviderRegistryService {
  private readonly providers = new Map<string, ProviderAdapter>();
  private plannerMode: PlannerProviderMode = "hostedAgentBridge";

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

  async getPlannerMode(): Promise<PlannerProviderMode> {
    return this.plannerMode;
  }

  async setPlannerMode(mode: PlannerProviderMode): Promise<PlannerProviderMode> {
    const availableModes = plannerModeInfos();
    if (!availableModes.some((item) => item.mode === mode)) {
      throw new Error(`Planner mode ${mode} is not supported.`);
    }
    this.plannerMode = mode;
    return this.plannerMode;
  }

  async listPlannerModes(): Promise<PlannerModeInfo[]> {
    const profiles = await this.listProviderProfiles();
    return plannerModeInfos().map((mode) => {
      const profile = profiles.find((item) => item.id === mode.providerId);
      return {
        ...mode,
        status: profile?.status ?? mode.status
      };
    });
  }

  async getActivePlannerProvider(): Promise<AgentProviderProfile | undefined> {
    const mode = plannerModeInfos().find((item) => item.mode === this.plannerMode);
    return mode ? this.getProviderStatus(mode.providerId) : undefined;
  }

  getActivePlannerProfile(): AgentProviderProfile {
    const modes = plannerModeInfos();
    const mode = modes.find((item) => item.mode === this.plannerMode) ?? requireFirst(modes, "No planner modes are configured.");
    const provider = this.providers.get(mode.providerId);
    const profiles = defaultProviderProfiles();
    return provider?.profile() ?? profiles.find((profile) => profile.id === mode.providerId) ?? requireFirst(profiles, "No provider profiles are configured.");
  }

  async getActivePlannerAdapter(): Promise<PlannerProvider> {
    const modes = plannerModeInfos();
    const mode = modes.find((item) => item.mode === this.plannerMode) ?? requireFirst(modes, "No planner modes are configured.");
    const provider = this.providers.get(mode.providerId);
    if (!provider || !isPlannerProvider(provider)) {
      throw new Error(`Active planner mode ${mode.mode} is not available. Check Settings > Planner.`);
    }
    return provider;
  }

  private async resolveProfile(providerId: string): Promise<AgentProviderProfile | undefined> {
    const provider = this.providers.get(providerId);
    if (provider) {
      return provider.status();
    }
    return defaultProviderProfiles().find((profile) => profile.id === providerId) ?? this.store.getProviderProfile(providerId);
  }
}

export class ActivePlannerProvider implements PlannerProvider {
  constructor(private readonly registry: ProviderRegistryService) {}

  profile(): AgentProviderProfile {
    return this.registry.getActivePlannerProfile();
  }

  async status(): Promise<AgentProviderProfile> {
    return (await this.registry.getActivePlannerAdapter()).status();
  }

  async createSession(input?: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }): Promise<AgentSessionRef> {
    return (await this.registry.getActivePlannerAdapter()).createSession(input);
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    return (await this.registry.getActivePlannerAdapter()).resumeSession(sessionRef);
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string, context?: PlannerRequest): Promise<AgentTurn> {
    return (await this.registry.getActivePlannerAdapter()).sendMessage(sessionRef, message, context);
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    return (await this.registry.getActivePlannerAdapter()).plan(input);
  }

  async review(input: ReviewRequest): Promise<ReviewResult> {
    return (await this.registry.getActivePlannerAdapter()).review(input);
  }

  async createTaskSpec(input: PlannerRequest): Promise<PlannerResponse> {
    const provider = await this.registry.getActivePlannerAdapter();
    if (!hasCreateTaskSpec(provider)) {
      throw new Error(`Active planner ${provider.profile().displayName} cannot create TaskSpecs.`);
    }
    return provider.createTaskSpec(input);
  }
}

export function defaultProviderProfiles(): AgentProviderProfile[] {
  const plannerHasKey = Boolean(process.env.AGENTBRIDGE_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  return [
    {
      id: "agentbridge-hosted-planner",
      kind: "planner",
      displayName: "AgentBridge Hosted Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "agentBridgeCloud",
      status: "needsAuth",
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
        mode: "hostedAgentBridge",
        reason: "Sign in to AgentBridge to use the hosted planner. No OpenAI API key is required in Simple Mode."
      }
    },
    {
      id: "openai-planner",
      kind: "planner",
      displayName: "OpenAI Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "apiKey",
      status: plannerHasKey ? "unavailable" : "needsAuth",
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
        mode: "userOpenAiApiKey",
        advanced: true,
        adapter: "placeholder",
        reason: plannerHasKey ? "Planner adapter is not implemented yet." : "Set AGENTBRIDGE_OPENAI_API_KEY or OPENAI_API_KEY."
      }
    },
    {
      id: "codex-local-planner",
      kind: "planner",
      displayName: "Codex Local Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "appServer",
      status: "unsupported",
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
        mode: "codexLocalPlanner",
        advanced: true,
        reason: "Future no-cloud planner mode. Not implemented yet."
      }
    },
    {
      id: "local-model-planner",
      kind: "planner",
      displayName: "Local Model Planner",
      capabilities: ["canPlan", "canReview"],
      authMode: "localApp",
      status: "unsupported",
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
        mode: "localModelPlaceholder",
        advanced: true,
        reason: "Future local model mode. Not implemented yet."
      }
    },
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

function mergeSessions(sessions: AgentSessionRef[]): AgentSessionRef[] {
  const byId = new Map<string, AgentSessionRef>();
  for (const session of sessions) {
    byId.set(session.id, session);
  }
  return [...byId.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function hasListSessions(provider: ProviderAdapter): provider is ExecutorProvider {
  return typeof (provider as ExecutorProvider).listSessions === "function";
}

function plannerModeInfos(): PlannerModeInfo[] {
  return [
    {
      mode: "hostedAgentBridge",
      providerId: "agentbridge-hosted-planner",
      label: "AgentBridge hosted",
      default: true,
      advanced: false,
      status: "needsAuth",
      description: "Default production planner. Sign in to AgentBridge; no OpenAI API key is stored on the desktop."
    },
    {
      mode: "userOpenAiApiKey",
      providerId: "openai-planner",
      label: "Use my OpenAI API key",
      default: false,
      advanced: true,
      status: "needsAuth",
      description: "Advanced BYOK mode for local power users."
    },
    {
      mode: "codexLocalPlanner",
      providerId: "codex-local-planner",
      label: "Codex-only local planner",
      default: false,
      advanced: true,
      status: "unsupported",
      description: "Future no-cloud mode that uses a separate Codex planning thread."
    },
    {
      mode: "localModelPlaceholder",
      providerId: "local-model-planner",
      label: "Local model",
      default: false,
      advanced: true,
      status: "unsupported",
      description: "Future local model planner."
    }
  ];
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

function isPlannerProvider(provider: ProviderAdapter): provider is PlannerProvider {
  return typeof (provider as PlannerProvider).plan === "function"
    && typeof (provider as PlannerProvider).review === "function"
    && typeof (provider as PlannerProvider).sendMessage === "function";
}

function hasCreateTaskSpec(provider: PlannerProvider): provider is PlannerProvider & {
  createTaskSpec(input: PlannerRequest): Promise<PlannerResponse>;
} {
  return typeof (provider as PlannerProvider & { createTaskSpec?: unknown }).createTaskSpec === "function";
}

function requireFirst<T>(values: T[], message: string): T {
  const value = values[0];
  if (!value) {
    throw new Error(message);
  }
  return value;
}
