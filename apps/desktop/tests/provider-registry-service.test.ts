import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  ExecutorProvider,
  ExecutorTaskRequest,
  ExecutorTaskResult
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

  it("uses explicitly registered executors", async () => {
    const registry = new ProviderRegistryService(new JsonFileStore(tempDir));
    registry.registerProvider(new MockExecutor("codex-test"));

    const profiles = await registry.listProviderProfiles();

    expect(profiles.map((profile) => profile.id)).toEqual(["codex", "codex-test"]);
    await expect(registry.getProviderStatus("codex-test")).resolves.toMatchObject({
      id: "codex-test",
      status: "available"
    });
  });
});

class MockExecutor implements ExecutorProvider {
  constructor(private readonly id: string) {}

  profile(): AgentProviderProfile {
    return {
      id: this.id,
      kind: "executor",
      displayName: this.id,
      capabilities: ["canExecuteCode", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
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
      providerKind: "executor",
      externalSessionId: `external_${this.id}`,
      status: "active",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      metadata: {}
    };
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    return sessionRef;
  }

  async listSessions(): Promise<AgentSessionRef[]> {
    return [];
  }

  async sendTask(input: ExecutorTaskRequest): Promise<ExecutorTaskResult> {
    return {
      id: `result_${this.id}`,
      providerId: this.id,
      deliveryMode: "dryRun",
      success: true,
      warnings: [],
      artifactIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      metadata: { missionId: input.missionId }
    };
  }
}
