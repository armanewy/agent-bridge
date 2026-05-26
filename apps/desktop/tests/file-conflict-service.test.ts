import { describe, expect, it } from "vitest";
import type { FileOwnership } from "@agentbridge/core";
import { FileConflictService } from "../src/services/file-conflict-service.js";

describe("FileConflictService", () => {
  it("detects same-file conflicts across active missions", () => {
    const service = new FileConflictService();
    const conflicts = service.detectConflicts([
      ownership("mission_1", "apps/desktop/src/App.tsx"),
      ownership("mission_2", "apps/desktop/src/App.tsx")
    ]);

    expect(conflicts).toEqual([
      {
        relativePath: "apps/desktop/src/App.tsx",
        missionIds: ["mission_1", "mission_2"],
        reason: "Multiple active missions changed or claimed the same file.",
        suggestedAction: "pause"
      }
    ]);
  });

  it("allows different changed files", () => {
    const service = new FileConflictService();
    const conflicts = service.detectConflicts([
      ownership("mission_1", "apps/desktop/src/App.tsx"),
      ownership("mission_2", "README.md")
    ]);

    expect(conflicts).toEqual([]);
  });

  it("warns when multiple active missions have no isolation", () => {
    const service = new FileConflictService();

    expect(service.detectNoIsolationWarning(["mission_1", "mission_2"])).toEqual([
      expect.objectContaining({ suggestedAction: "isolate" })
    ]);
  });
});

function ownership(missionId: string, relativePath: string): FileOwnership {
  return {
    id: `${missionId}_${relativePath}`,
    missionId,
    workspaceId: `${missionId}_workspace`,
    relativePath,
    status: "changed",
    firstSeenAt: "2026-05-26T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z"
  };
}
