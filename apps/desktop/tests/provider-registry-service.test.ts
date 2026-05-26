import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    expect(profiles.map((profile) => profile.id)).toEqual(["codex", "openai-planner"]);
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
});
