import { z } from "zod";

export const MissionWorkspaceStrategySchema = z.enum(["none", "branch", "gitWorktree"]);
export type MissionWorkspaceStrategy = z.infer<typeof MissionWorkspaceStrategySchema>;

export const MissionWorkspaceSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  baseRepoPath: z.string().min(1),
  workingPath: z.string().min(1),
  strategy: MissionWorkspaceStrategySchema,
  baseBranch: z.string().optional(),
  branchName: z.string().optional(),
  worktreeName: z.string().optional(),
  status: z.enum(["pending", "active", "dirty", "merged", "abandoned", "failed"]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type MissionWorkspace = z.infer<typeof MissionWorkspaceSchema>;

export const FileOwnershipSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  workspaceId: z.string().min(1),
  relativePath: z.string().min(1),
  status: z.enum(["claimed", "changed", "conflicted", "released"]),
  firstSeenAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type FileOwnership = z.infer<typeof FileOwnershipSchema>;

export const MissionQueueItemSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().min(1),
  priority: z.number().int(),
  status: z.enum(["queued", "running", "paused", "blocked", "completed", "cancelled"]),
  assignedWorkspaceId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
export type MissionQueueItem = z.infer<typeof MissionQueueItemSchema>;

export interface ParallelMissionPolicy {
  maxConcurrentMissions: number;
  requireIsolationForAutonomous: boolean;
  blockSameFileConflicts: boolean;
  allowNoIsolationManualOnly: boolean;
}

export interface ParallelMissionStartInput {
  policy: ParallelMissionPolicy;
  runningMissions: MissionQueueItem[];
  candidateMode: "manual" | "supervised" | "autonomous";
  candidateWorkspaceStrategy?: MissionWorkspaceStrategy;
  conflicts?: FileOwnership[];
}

export interface ParallelMissionStartDecision {
  allowed: boolean;
  reason: string;
  warnings: string[];
}

export function evaluateParallelMissionStart(input: ParallelMissionStartInput): ParallelMissionStartDecision {
  if (input.runningMissions.length >= input.policy.maxConcurrentMissions) {
    return { allowed: false, reason: "Maximum concurrent missions reached.", warnings: [] };
  }
  if (input.policy.requireIsolationForAutonomous && input.candidateMode === "autonomous" && input.candidateWorkspaceStrategy === "none") {
    return { allowed: false, reason: "Autonomous parallel missions require branch or worktree isolation.", warnings: [] };
  }
  if (input.policy.blockSameFileConflicts && (input.conflicts ?? []).some((item) => item.status === "conflicted")) {
    return { allowed: false, reason: "File ownership conflict detected.", warnings: ["Resolve conflicting changed files before starting another mission."] };
  }
  const warnings = input.candidateWorkspaceStrategy === "none" ? ["No workspace isolation is active."] : [];
  return { allowed: true, reason: "Mission can start.", warnings };
}
