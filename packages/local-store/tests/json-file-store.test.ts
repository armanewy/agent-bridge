import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "../src/index.js";
import type { AuditEvent, DeliveryAttempt, Handoff, Link } from "@agentbridge/core";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-store-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("JsonFileStore", () => {
  it("saves and lists links", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const link: Link = {
      id: "link_1",
      name: "ChatGPT to Codex",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "implementationBrief",
      deliveryMode: "codexDeepLink",
      createdAt: now,
      updatedAt: now,
      enabled: true
    };

    await store.saveLink(link);

    expect(await store.getLink("link_1")).toEqual(link);
    expect(await store.listLinks()).toHaveLength(1);
  });

  it("saves handoffs and audit events", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const handoff: Handoff = {
      id: "handoff_1",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Send this",
      structured: {
        goal: "Send",
        context: "Send this",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };
    const event: AuditEvent = {
      id: "audit_1",
      type: "captureCreated",
      entityId: "cap_1",
      details: { captureType: "selectedText" },
      createdAt: now
    };

    await store.saveHandoff(handoff);
    await store.appendAuditEvent(event);

    expect(await store.getHandoff("handoff_1")).toEqual(handoff);
    expect(await store.listAuditEvents()).toEqual([event]);
  });

  it("stores settings locally", async () => {
    const store = new JsonFileStore(tempDir);

    await store.saveSetting("theme", "system");

    expect(await store.getSetting("theme")).toBe("system");
  });

  it("stores delivery attempts", async () => {
    const store = new JsonFileStore(tempDir);
    const attempt: DeliveryAttempt = {
      id: "delivery_1",
      handoffId: "handoff_1",
      targetId: "target_1",
      strategy: "codexDeepLink",
      success: true,
      warnings: [],
      targetMetadata: { repoPath: tempDir },
      attemptedAt: new Date().toISOString()
    };

    await store.saveDeliveryAttempt(attempt);

    expect(await store.listDeliveryAttempts("handoff_1")).toEqual([attempt]);
  });
});
