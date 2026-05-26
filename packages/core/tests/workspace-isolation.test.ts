import { describe, expect, it } from "vitest";
import { evaluateParallelMissionStart, MissionWorkspaceSchema } from "../src/index.js";

describe("workspace isolation", () => {
  it("parses mission workspaces", () => {
    expect(
      MissionWorkspaceSchema.parse({
        id: "workspace_1",
        missionId: "mission_1",
        baseRepoPath: "C:/repo",
        workingPath: "C:/repo-worktree",
        strategy: "gitWorktree",
        branchName: "agentbridge/mission-1",
        worktreeName: ".agentbridge-mission-1",
        status: "active",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z"
      })
    ).toMatchObject({ strategy: "gitWorktree" });
  });

  it("requires isolation for autonomous parallel starts when policy says so", () => {
    const decision = evaluateParallelMissionStart({
      policy: {
        maxConcurrentMissions: 2,
        requireIsolationForAutonomous: true,
        blockSameFileConflicts: true,
        allowNoIsolationManualOnly: true
      },
      runningMissions: [],
      candidateMode: "autonomous",
      candidateWorkspaceStrategy: "none"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/require/i);
  });

  it("blocks same-file conflicts", () => {
    const decision = evaluateParallelMissionStart({
      policy: {
        maxConcurrentMissions: 2,
        requireIsolationForAutonomous: true,
        blockSameFileConflicts: true,
        allowNoIsolationManualOnly: true
      },
      runningMissions: [],
      candidateMode: "supervised",
      candidateWorkspaceStrategy: "gitWorktree",
      conflicts: [
        {
          id: "ownership_1",
          missionId: "mission_1",
          workspaceId: "workspace_1",
          relativePath: "apps/desktop/src/App.tsx",
          status: "conflicted",
          firstSeenAt: "2026-05-26T00:00:00.000Z",
          updatedAt: "2026-05-26T00:00:00.000Z"
        }
      ]
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/conflict/i);
  });
});
