import { type MissionQueueItem, evaluateParallelMissionStart, type ParallelMissionPolicy } from "@agentbridge/core";

export interface MissionQueueStorage {
  saveMissionQueueItem?(item: MissionQueueItem): Promise<void>;
  listMissionQueueItems?(): Promise<MissionQueueItem[]>;
}

export class MissionQueueService {
  constructor(private readonly store: MissionQueueStorage = {}) {}

  async enqueue(item: MissionQueueItem): Promise<MissionQueueItem> {
    await this.store.saveMissionQueueItem?.(item);
    return item;
  }

  async enqueueMission(item: MissionQueueItem): Promise<MissionQueueItem> {
    return this.enqueue(item);
  }

  async startNext(): Promise<MissionQueueItem | undefined> {
    const items = await this.listQueue();
    const next = items.find((item) => item.status === "queued");
    if (!next) {
      return undefined;
    }
    const updated = { ...next, status: "running" as const, updatedAt: new Date().toISOString() };
    await this.store.saveMissionQueueItem?.(updated);
    return updated;
  }

  async pauseMission(missionId: string): Promise<MissionQueueItem | undefined> {
    return this.updateMissionStatus(missionId, "paused");
  }

  async cancelMission(missionId: string): Promise<MissionQueueItem | undefined> {
    return this.updateMissionStatus(missionId, "cancelled");
  }

  async listQueue(): Promise<MissionQueueItem[]> {
    return this.store.listMissionQueueItems?.() ?? [];
  }

  async getRunningMissions(): Promise<MissionQueueItem[]> {
    return (await this.listQueue()).filter((item) => item.status === "running");
  }

  async canStart(policy: ParallelMissionPolicy, candidate: MissionQueueItem): Promise<ReturnType<typeof evaluateParallelMissionStart>> {
    const items = await this.store.listMissionQueueItems?.() ?? [];
    const running = items.filter((item) => item.status === "running");
    return evaluateParallelMissionStart({ policy, runningMissions: running, candidateMode: "autonomous", candidateWorkspaceStrategy: candidate.assignedWorkspaceId ? "gitWorktree" : "none" });
  }

  private async updateMissionStatus(missionId: string, status: MissionQueueItem["status"]): Promise<MissionQueueItem | undefined> {
    const current = (await this.listQueue()).find((item) => item.missionId === missionId);
    if (!current) {
      return undefined;
    }
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    await this.store.saveMissionQueueItem?.(updated);
    return updated;
  }
}
