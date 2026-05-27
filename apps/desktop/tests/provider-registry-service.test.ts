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

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-provider-registry-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("ProviderRegistryService", () => {
  it("lists the Codex executor placeholder only", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);

    const profiles = await registry.listProviderProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual(["codex"]);
    expect(profiles.find((profile) => profile.id === "codex")?.kind).toBe("executor");
  });

  it("persists placeholder provider profiles after listing", async () => {
    const store = new JsonFileStore(tempDir);
    const registry = new ProviderRegistryService(store);

    await registry.listProviderProfiles();

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

  it("uses explicitly registered adapters without adding default planner modes", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));
    registry.registerProvider(new MockManualPlanner("chatgpt-manual-test", "manual response"));

    const profiles = await registry.listProviderProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual(["chatgpt-manual-test", "codex"]);
    await expect(registry.getProviderStatus("chatgpt-manual-test")).resolves.toMatchObject({
      id: "chatgpt-manual-test",
      status: "available"
    });
  });
});

class MockManualPlanner implements PlannerProvider {
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
