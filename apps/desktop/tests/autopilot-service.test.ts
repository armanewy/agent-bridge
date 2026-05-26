import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Artifact, AutopilotPolicy, HandoffCard, Mission, Run, TaskSpec, VerificationResult } from "@agentbridge/core";
import { JsonFileStore } from "@agentbridge/local-store";
import { ArtifactBrokerService } from "../src/services/artifact-broker-service.js";
import { AutopilotService } from "../src/services/autopilot-service.js";
import { PlatformService } from "../src/services/platform-service.js";
import type { WorkbenchService } from "../src/services/workbench-service.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "agentbridge-autopilot-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("AutopilotService", () => {
  it("runs until a supervised policy needs Codex approval", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    const service = new AutopilotService(store, fakeWorkbench(store), fixedNow);

    const status = await service.startAutopilot("mission_1");

    expect(status.run?.status).toBe("blocked");
    expect(status.pendingDecision?.prompt).toContain("Send this TaskSpec to Codex");
    expect((await store.listAutopilotSteps(status.run?.id ?? "")).map((step) => step.kind)).toEqual([
      "plan",
      "createTaskSpec",
      "requestApproval"
    ]);
  });

  it("can complete a one-iteration autonomous loop", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    const policy: AutopilotPolicy = {
      id: "policy_autonomous",
      name: "Autonomous",
      mode: "autonomous",
      maxIterations: 1,
      allowPlannerTurnsWithoutApproval: true,
      allowCodexTurnsWithoutApproval: true,
      allowVerificationWithoutApproval: true,
      allowShellCommands: "configuredOnly",
      allowFileWrites: "repoOnly",
      allowNetworkAccess: false,
      stopOnVerificationFailure: false,
      stopOnRedactionFinding: true,
      stopOnProviderWarning: true,
      createdAt: fixedNow(),
      updatedAt: fixedNow()
    };
    await store.saveAutopilotPolicy(policy);
    const service = new AutopilotService(store, fakeWorkbench(store), fixedNow);

    const status = await service.startAutopilot("mission_1", policy.id);

    expect(status.run?.status).toBe("passed");
    expect(status.run?.stopReason).toBe("Verification passed.");
    await expect(store.listAutopilotSteps(status.run?.id ?? "")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "monitorExecutor", status: "completed" })])
    );
  });

  it("pauses before provider transfer when mission files look risky", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    const broker = new ArtifactBrokerService(store, new PlatformService({ platform: "win32", userDataDir: tempDir }), fixedNow);
    await broker.importGeneratedTextAsFile("mission_1", ".env", "OPENAI_API_KEY=secret", { classification: "document" });
    const service = new AutopilotService(store, fakeWorkbench(store), broker, fixedNow);

    const status = await service.startAutopilot("mission_1");

    expect(status.run?.status).toBe("blocked");
    expect(status.pendingDecision?.prompt).toContain("Approve risky mission files");
    expect(status.pendingDecision?.prompt).toContain("Environment-style secret");
  });

  it("stores steering notes as mission artifacts", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    const policy: AutopilotPolicy = {
      id: "policy_manual",
      name: "Manual",
      mode: "manual",
      maxIterations: 1,
      allowPlannerTurnsWithoutApproval: true,
      allowCodexTurnsWithoutApproval: false,
      allowVerificationWithoutApproval: true,
      allowShellCommands: "configuredOnly",
      allowFileWrites: "repoOnly",
      allowNetworkAccess: false,
      stopOnVerificationFailure: false,
      stopOnRedactionFinding: true,
      stopOnProviderWarning: true,
      createdAt: fixedNow(),
      updatedAt: fixedNow()
    };
    await store.saveAutopilotPolicy(policy);
    const service = new AutopilotService(store, fakeWorkbench(store), fixedNow);
    const started = await service.startAutopilot("mission_1", policy.id);

    await service.steerAutopilot(started.run?.id ?? "", "Keep the change scoped.");

    expect((await store.listArtifactsForMission("mission_1")).some((artifact) => artifact.title === "User steering note")).toBe(true);
  });
});

function fakeWorkbench(store: JsonFileStore): WorkbenchService {
  return {
    async sendUserMessageToPlanner(missionId: string) {
      const artifact = textArtifact(missionId, "modelResponse", "Planner response");
      await store.saveArtifact(artifact);
      return {
        providerId: "openai-planner",
        content: artifact.content ?? "",
        artifactIds: [artifact.id],
        createdAt: fixedNow(),
        metadata: {}
      };
    },
    async createTaskSpecFromLatestPlannerTurn(missionId: string) {
      const artifact = textArtifact(missionId, "taskSpec", "TaskSpec");
      const card: HandoffCard = {
        id: "card_1",
        missionId,
        sourceId: "provider:openai-planner",
        captureId: artifact.id,
        targetId: "provider:codex",
        recipe: "implementationBrief",
        taskSpec: taskSpec(),
        generatedPrompt: "Goal:\nDo the thing.",
        redactionFindings: [],
        deliveryAttemptIds: [],
        artifactIds: [artifact.id],
        createdAt: fixedNow(),
        updatedAt: fixedNow()
      };
      await store.saveArtifact(artifact);
      await store.saveHandoffCard(card);
      return card;
    },
    async sendTaskSpecToExecutor(missionId: string) {
      const artifact = textArtifact(missionId, "deliveryResult", "Delivered");
      artifact.title = "Executor delivery result";
      await store.saveArtifact(artifact);
      return {
        providerId: "codex",
        deliveryMode: "dryRun",
        success: true,
        warnings: [],
        artifactIds: [artifact.id],
        createdAt: fixedNow(),
        metadata: {}
      };
    },
    async runMissionVerification(missionId: string) {
      const result: VerificationResult = {
        id: "verification_1",
        missionId,
        status: "passed",
        commandResults: [],
        summary: "Passed",
        artifactIds: [],
        createdAt: fixedNow()
      };
      await store.saveVerificationResult(result);
      const run: Run = {
        id: "run_1",
        missionId,
        status: "completed",
        stepIds: [],
        artifactIds: [],
        startedAt: fixedNow(),
        completedAt: fixedNow(),
        createdAt: fixedNow(),
        updatedAt: fixedNow()
      };
      return {
        run,
        result,
        artifacts: []
      };
    }
  } as unknown as WorkbenchService;
}

function mission(): Mission {
  return {
    id: "mission_1",
    title: "Autopilot mission",
    goal: "Run a simple loop.",
    status: "draft",
    sourceIds: [],
    captureIds: [],
    handoffCardIds: [],
    artifactIds: [],
    runIds: [],
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

function taskSpec(): TaskSpec {
  return {
    title: "Task",
    goal: "Do the task.",
    background: "Context",
    instructions: ["Implement"],
    requirements: ["Pass"],
    constraints: ["Scoped"],
    nonGoals: ["No extras"],
    acceptanceCriteria: ["Done"],
    suggestedFiles: [],
    verificationSteps: [],
    expectedSummaryFormat: "Summary"
  };
}

function textArtifact(missionId: string, kind: Artifact["kind"], content: string): Artifact {
  return {
    id: `artifact_${kind}`,
    missionId,
    kind,
    title: kind,
    content,
    metadata: {},
    createdAt: fixedNow()
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
