import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "../src/index.js";
import type {
  Artifact,
  AuditEvent,
  DeliveryAttempt,
  Handoff,
  HandoffCard,
  Link,
  Mission,
  TaskSpec,
  VerificationResult
} from "@agentbridge/core";

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

  it("loads a v1-shaped store without losing existing handoffs", async () => {
    const now = new Date().toISOString();
    const handoff: Handoff = {
      id: "handoff_legacy",
      captureId: "cap_1",
      sourceId: "src_1",
      targetId: "target_1",
      transformId: "rawRelay",
      prompt: "Legacy handoff",
      structured: {
        goal: "Relay",
        context: "Legacy handoff",
        constraints: [],
        acceptanceCriteria: [],
        suggestedFiles: [],
        verificationSteps: [],
        originalCaptureRef: "cap_1"
      },
      redactionFindings: [],
      createdAt: now
    };
    await writeFile(
      join(tempDir, "agentbridge-store.json"),
      JSON.stringify({
        version: 1,
        links: {},
        sources: {},
        targets: {},
        captures: {},
        handoffs: { [handoff.id]: handoff },
        deliveryAttempts: {},
        approvals: {},
        auditEvents: [],
        settings: {}
      }),
      "utf8"
    );

    const store = new JsonFileStore(tempDir);

    expect(await store.getHandoff("handoff_legacy")).toEqual(handoff);
    expect(await store.listMissions()).toEqual([]);
  });

  it("roundtrips mission, handoff card, and artifact", async () => {
    const store = new JsonFileStore(tempDir);
    const now = new Date().toISOString();
    const mission: Mission = {
      id: "mission_1",
      title: "Mission",
      goal: "Compile a task spec",
      status: "draft",
      sourceIds: ["src_1"],
      captureIds: ["cap_1"],
      handoffCardIds: ["card_1"],
      artifactIds: ["artifact_1"],
      runIds: [],
      createdAt: now,
      updatedAt: now
    };
    const card: HandoffCard = {
      id: "card_1",
      missionId: mission.id,
      sourceId: "src_1",
      captureId: "cap_1",
      targetId: "target_1",
      recipe: "implementationBrief",
      taskSpec,
      generatedPrompt: "Goal:\nCompile a task spec.",
      redactionFindings: [],
      deliveryAttemptIds: [],
      artifactIds: ["artifact_1"],
      createdAt: now,
      updatedAt: now
    };
    const artifact: Artifact = {
      id: "artifact_1",
      missionId: mission.id,
      handoffCardId: card.id,
      kind: "generatedPrompt",
      title: "Generated prompt",
      content: card.generatedPrompt,
      metadata: {},
      createdAt: now
    };

    await store.saveMission(mission);
    await store.saveHandoffCard(card);
    await store.saveArtifact(artifact);

    expect(await store.getMission(mission.id)).toEqual(mission);
    expect(await store.listHandoffCardsForMission(mission.id)).toEqual([card]);
    expect(await store.listArtifactsForHandoffCard(card.id)).toEqual([artifact]);
  });

  it("roundtrips verification results", async () => {
    const store = new JsonFileStore(tempDir);
    const result: VerificationResult = {
      id: "verification_1",
      missionId: "mission_1",
      status: "needs_review",
      commandResults: [],
      summary: "No commands configured.",
      artifactIds: [],
      createdAt: new Date().toISOString()
    };

    await store.saveVerificationResult(result);

    expect(await store.listVerificationResultsForMission("mission_1")).toEqual([result]);
  });
});

const taskSpec: TaskSpec = {
  title: "Compile task",
  goal: "Create a durable task card.",
  background: "Captured guidance",
  instructions: ["Create the task"],
  requirements: ["Persist it"],
  constraints: ["Keep existing APIs"],
  nonGoals: ["Provider expansion"],
  acceptanceCriteria: ["Tests pass"],
  suggestedFiles: [],
  verificationSteps: ["pnpm test"],
  expectedSummaryFormat: "Summary, tests, risks."
};
