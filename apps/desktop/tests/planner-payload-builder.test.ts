import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Artifact, Mission } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { PlannerPayloadBuilder } from "../src/services/planner-payload-builder.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-payload-builder-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("PlannerPayloadBuilder", () => {
  it("omits full repo paths by default", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission({ repoPath: "C:\\Users\\name\\very-secret-path", repoName: "agent-bridge" }));
    const result = await new PlannerPayloadBuilder(store, fixedNow).buildPlannerRequestPayload("mission_1", "plan", {
      prompt: "Plan a task."
    });

    const serialized = JSON.stringify(result.payload);
    expect(serialized).toContain("agent-bridge");
    expect(serialized).not.toContain("very-secret-path");
  });

  it("truncates command output excerpts", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    await store.saveArtifact(artifact({ id: "artifact_log", kind: "testOutput", content: "x".repeat(9000) }));

    const result = await new PlannerPayloadBuilder(store, fixedNow).buildPlannerRequestPayload("mission_1", "review");

    expect(JSON.stringify(result.payload)).toContain("[truncated");
    expect(result.estimatedBytes).toBeLessThan(64 * 1024);
  });

  it("does not include duplicate artifact ids", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    await store.saveArtifact(artifact({ id: "artifact_plan", kind: "modelResponse", content: "Planner output" }));

    const result = await new PlannerPayloadBuilder(store, fixedNow).buildPlannerRequestPayload("mission_1", "taskSpec", {
      contextArtifactIds: ["artifact_plan", "artifact_plan"]
    });

    expect(result.includedArtifactIds).toEqual(["artifact_plan"]);
  });

  it("excludes unapproved file artifacts", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    await store.saveArtifact(artifact({ id: "artifact_file", kind: "fileReference", content: "src/secret.ts" }));

    const result = await new PlannerPayloadBuilder(store, fixedNow).buildPlannerRequestPayload("mission_1", "plan", {
      artifactIds: ["artifact_file"]
    });

    expect(result.excludedArtifactIds).toEqual(["artifact_file"]);
    expect(JSON.stringify(result.payload)).not.toContain("src/secret.ts");
  });

  it("redacts and reports high-severity findings", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());

    const result = await new PlannerPayloadBuilder(store, fixedNow).buildPlannerRequestPayload("mission_1", "plan", {
      prompt: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890"
    });

    expect(result.redactionFindings[0]).toMatchObject({ severity: "high", kind: "bearerToken" });
    expect(JSON.stringify(result.payload)).toContain("[REDACTED:bearerToken]");
  });
});

function mission(patch: Partial<Mission["repoContext"]> = {}): Mission {
  return {
    id: "mission_1",
    title: "Mission",
    goal: "Do the work.",
    status: "draft",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: [],
    artifactIds: [],
    runIds: [],
    repoContext: {
      repoPath: tempDir,
      repoName: "agent-bridge",
      ...patch
    },
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

function artifact(input: { id: string; kind: Artifact["kind"]; content: string }): Artifact {
  return {
    id: input.id,
    missionId: "mission_1",
    kind: input.kind,
    title: input.id,
    content: input.content,
    metadata: {},
    createdAt: fixedNow()
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
