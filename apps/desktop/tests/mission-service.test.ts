import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import type { Mission } from "@agentbridge/core";
import { MissionService } from "../src/services/mission-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-mission-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("MissionService", () => {
  it("lists missions and opens detail", async () => {
    const store = new JsonFileStore(tempDir);
    const mission: Mission = {
      id: "mission_1",
      title: "Mission",
      goal: "Inspect detail",
      status: "draft",
      sourceIds: [],
      captureIds: [],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    await store.saveMission(mission);
    const service = new MissionService(store);

    await expect(service.listMissions()).resolves.toEqual([mission]);
    await expect(service.getMissionDetail(mission.id)).resolves.toMatchObject({ mission });
  });
});
