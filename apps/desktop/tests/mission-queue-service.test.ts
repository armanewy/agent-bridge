import { describe, expect, it } from "vitest";
import type { MissionQueueItem } from "@agentbridge/core";
import { MissionQueueService } from "../src/services/mission-queue-service.js";

describe("MissionQueueService", () => {
  it("starts the next queued mission and can pause it independently", async () => {
    const store = new InMemoryQueueStore();
    const service = new MissionQueueService(store);
    const item = queueItem("mission_1");

    await service.enqueueMission(item);
    const started = await service.startNext();
    const paused = await service.pauseMission("mission_1");

    expect(started).toMatchObject({ missionId: "mission_1", status: "running" });
    expect(paused).toMatchObject({ missionId: "mission_1", status: "paused" });
  });

  it("blocks autonomous starts when isolation is required and missing", async () => {
    const service = new MissionQueueService(new InMemoryQueueStore());

    const decision = await service.canStart(
      {
        maxConcurrentMissions: 2,
        requireIsolationForAutonomous: true,
        blockSameFileConflicts: true,
        allowNoIsolationManualOnly: true
      },
      queueItem("mission_1")
    );

    expect(decision.allowed).toBe(false);
  });
});

class InMemoryQueueStore {
  private readonly items = new Map<string, MissionQueueItem>();

  async saveMissionQueueItem(item: MissionQueueItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async listMissionQueueItems(): Promise<MissionQueueItem[]> {
    return [...this.items.values()].sort((a, b) => b.priority - a.priority);
  }
}

function queueItem(missionId: string): MissionQueueItem {
  return {
    id: `queue_${missionId}`,
    missionId,
    priority: 1,
    status: "queued",
    createdAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
}
