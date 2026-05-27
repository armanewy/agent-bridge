import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  PlannerProvider,
  PlannerRequest,
  PlannerResponse,
  ReviewRequest,
  ReviewResult
} from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { ProviderRegistryService } from "../src/services/provider-registry-service.js";

let tempDir: string;
let oldOpenAiKey: string | undefined;
let oldAgentBridgeOpenAiKey: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-provider-registry-"));
  oldOpenAiKey = process.env.OPENAI_API_KEY;
  oldAgentBridgeOpenAiKey = process.env.AGENTBRIDGE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AGENTBRIDGE_OPENAI_API_KEY;
});

afterEach(async () => {
  if (oldOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = oldOpenAiKey;
  }
  if (oldAgentBridgeOpenAiKey === undefined) {
    delete process.env.AGENTBRIDGE_OPENAI_API_KEY;
  } else {
    process.env.AGENTBRIDGE_OPENAI_API_KEY = oldAgentBridgeOpenAiKey;
  }
  await rm(tempDir, { recursive: true, force: true });
});

describe("ProviderRegistryService", () => {
  it("lists placeholder provider profiles", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);

    const profiles = await registry.listProviderProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual([
      "agentbridge-hosted-planner",
      "codex",
      "codex-local-planner",
      "local-model-planner",
      "openai-planner"
    ]);
    expect(profiles.find((profile) => profile.id === "agentbridge-hosted-planner")?.kind).toBe("planner");
    expect(profiles.find((profile) => profile.id === "openai-planner")?.kind).toBe("planner");
    expect(profiles.find((profile) => profile.id === "codex")?.kind).toBe("executor");
  });

  it("reports OpenAI Planner as needsAuth when no API key is configured", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));

    const profile = await registry.getProviderStatus("openai-planner");

    expect(profile?.status).toBe("needsAuth");
    expect(profile?.authMode).toBe("apiKey");
  });

  it("persists placeholder provider profiles after listing", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);

    await registry.listProviderProfiles();

    expect(await store.getProviderProfile("openai-planner")).toMatchObject({
      id: "openai-planner",
      kind: "planner"
    });
    expect(await store.getProviderProfile("agentbridge-hosted-planner")).toMatchObject({
      id: "agentbridge-hosted-planner",
      kind: "planner",
      authMode: "agentBridgeCloud"
    });
    expect(await store.getProviderProfile("codex")).toMatchObject({
      id: "codex",
      kind: "executor"
    });
  });

  it("lists stored sessions through the registry", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);
    const session = {
      id: "session_1",
      providerId: "codex",
      providerKind: "executor" as const,
      externalSessionId: "thread_123",
      status: "idle" as const,
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      metadata: {}
    };
    await store.saveAgentSession(session);

    expect(await registry.listSessions("codex")).toEqual([session]);
  });

  it("uses hosted AgentBridge Planner as the default planner mode", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));

    expect(await registry.getPlannerMode()).toBe("hostedAgentBridge");
    expect(await registry.getActivePlannerProvider()).toMatchObject({
      id: "agentbridge-hosted-planner",
      authMode: "agentBridgeCloud"
    });
  });

  it("switches planner modes and rejects invalid modes", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));

    await expect(registry.setPlannerMode("userOpenAiApiKey")).resolves.toBe("userOpenAiApiKey");
    await expect(registry.setPlannerMode("invalid" as never)).rejects.toThrow("not supported");
    const modes = await registry.listPlannerModes();
    expect(modes.find((mode) => mode.mode === "hostedAgentBridge")?.default).toBe(true);
    expect(modes.find((mode) => mode.mode === "userOpenAiApiKey")?.advanced).toBe(true);
  });

  it("persists selected planner mode across registry instances", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);

    await registry.setPlannerMode("userOpenAiApiKey");

    const nextRegistry = new ProviderRegistryService(store);
    await expect(nextRegistry.getPlannerMode()).resolves.toBe("userOpenAiApiKey");
    await expect(nextRegistry.getActivePlannerProvider()).resolves.toMatchObject({ id: "openai-planner" });
  });

  it("resolves the active planner adapter from the selected planner mode", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));
    registry.registerProvider(new MockPlanner("agentbridge-hosted-planner", "hosted response"));
    registry.registerProvider(new MockPlanner("codex-local-planner", "local response"));

    await expect((await registry.getActivePlannerAdapter()).plan(plannerRequest())).resolves.toMatchObject({
      content: "hosted response"
    });

    await registry.setPlannerMode("codexLocalPlanner");

    expect(registry.getActivePlannerProfile()).toMatchObject({ id: "codex-local-planner" });
    await expect((await registry.getActivePlannerAdapter()).plan(plannerRequest())).resolves.toMatchObject({
      content: "local response"
    });
  });
});

class MockPlanner implements PlannerProvider {
  constructor(private readonly id: string, private readonly response: string) {}

  profile(): AgentProviderProfile {
    return {
      id: this.id,
      kind: "planner",
      displayName: this.id,
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "none",
      status: "available",
      metadata: {}
    };
  }

  async status(): Promise<AgentProviderProfile> {
    return this.profile();
  }

  async createSession(): Promise<AgentSessionRef> {
    return {
      id: `session_${this.id}`,
      providerId: this.id,
      providerKind: "planner",
      externalSessionId: `external_${this.id}`,
      status: "active",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      metadata: {}
    };
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    return sessionRef;
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string): Promise<AgentTurn> {
    return {
      id: `turn_${this.id}`,
      providerId: this.id,
      sessionRefId: sessionRef.id,
      role: "assistant",
      content: message,
      status: "completed",
      artifactIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
      metadata: {}
    };
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    return {
      providerId: this.id,
      content: this.response,
      artifactIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: { prompt: input.prompt }
    };
  }

  async review(_input: ReviewRequest): Promise<ReviewResult> {
    return {
      providerId: this.id,
      content: this.response,
      statusSuggestion: "needs_review",
      artifactIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: {}
    };
  }
}

function plannerRequest(): PlannerRequest {
  return {
    missionId: "mission_1",
    prompt: "Plan",
    metadata: {}
  };
}
