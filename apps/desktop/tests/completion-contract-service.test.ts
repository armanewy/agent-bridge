import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "@agentbridge/local-store";
import { CompletionContractService } from "../src/services/completion-contract-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-completion-contract-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("CompletionContractService", () => {
  it("creates a verifiable contract from TaskSpec criteria and verification steps", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new CompletionContractService(store);

    const contract = await service.createFromTaskSpec("mission_1", {
      title: "Compact workbench",
      goal: "Make the Workbench compact at 760x940.",
      background: "Desktop utility UI.",
      instructions: ["Tighten the layout"],
      requirements: ["No horizontal scrolling"],
      constraints: ["Keep Simple Mode"],
      nonGoals: ["No browser import work"],
      acceptanceCriteria: ["pnpm test passes"],
      suggestedFiles: [],
      verificationSteps: ["pnpm test"],
      expectedSummaryFormat: "Summary, verification, risks."
    });

    expect(contract.status).toBe("valid");
    await expect(store.listCompletionContractsForMission("mission_1")).resolves.toEqual([contract]);
  });

  it("marks intent-only contracts as needing review, not autonomous pass", async () => {
    const store = new JsonFileStore(tempDir);
    const service = new CompletionContractService(store);

    const contract = await service.createFromIntent("mission_1", "Make the UI feel better.");
    const evaluation = await service.evaluate(contract);

    expect(contract.status).toBe("valid");
    expect(evaluation.status).toBe("needs_review");
  });
});
