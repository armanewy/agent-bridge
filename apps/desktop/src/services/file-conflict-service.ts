import type { FileOwnership } from "@agentbridge/core";

export interface FileConflict {
  relativePath: string;
  missionIds: string[];
  reason: string;
  suggestedAction: "continue" | "pause" | "isolate" | "review" | "stop";
}

export class FileConflictService {
  detectConflicts(items: FileOwnership[]): FileConflict[] {
    const byPath = new Map<string, Set<string>>();
    for (const item of items) {
      if (item.status === "released") continue;
      const set = byPath.get(item.relativePath) ?? new Set<string>();
      set.add(item.missionId);
      byPath.set(item.relativePath, set);
    }
    return [...byPath.entries()].flatMap(([relativePath, missionIds]) => {
      if (missionIds.size < 2) return [];
      return [{
        relativePath,
        missionIds: [...missionIds],
        reason: "Multiple active missions changed or claimed the same file.",
        suggestedAction: "pause" as const
      }];
    });
  }

  detectNoIsolationWarning(activeMissionIds: string[]): FileConflict[] {
    if (activeMissionIds.length < 2) {
      return [];
    }
    return [{
      relativePath: "*",
      missionIds: activeMissionIds,
      reason: "Multiple active missions are using the same repo without branch/worktree isolation.",
      suggestedAction: "isolate"
    }];
  }
}
