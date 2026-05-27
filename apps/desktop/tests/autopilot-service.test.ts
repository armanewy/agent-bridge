import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Artifact, AutopilotPolicy, CompletionContract, HandoffCard, Mission, Run, TaskSpec, VerificationResult } from "@agentbridge/core";
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

  it("continues after the supervised Codex approval is resolved", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    const service = new AutopilotService(store, fakeWorkbench(store), fixedNow);

    const blocked = await service.startAutopilot("mission_1");
    const continued = await service.resolvePendingDecision(blocked.pendingDecision?.id ?? "", "Approve");

    expect(continued.run?.status).toBe("passed");
    expect((await store.listArtifactsForMission("mission_1")).some((artifact) => artifact.title === "Executor delivery result")).toBe(true);
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

  it("blocks autonomous execution when completion contract lacks objective evidence", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    await store.saveArtifact(textArtifact("mission_1", "modelResponse", "Planner response"));
    await store.saveHandoffCard(handoffCard());
    await store.saveCompletionContract(completionContract("needs_user_input"));
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

    expect(status.run?.status).toBe("blocked");
    expect(status.pendingDecision?.prompt).toContain("completion contract");
  });

  it("stops when verification repeats the same failure", async () => {
    const store = new JsonFileStore(tempDir);
    await store.saveMission(mission());
    await store.saveArtifact(textArtifact("mission_1", "modelResponse", "Planner response"));
    await store.saveHandoffCard(handoffCard());
    const delivery = textArtifact("mission_1", "deliveryResult", "Delivered cleanly");
    delivery.title = "Executor delivery result";
    await store.saveArtifact(delivery);
    await store.saveVerificationResult(failedVerification("verification_1"));
    await store.saveVerificationResult(failedVerification("verification_2"));
    const policy: AutopilotPolicy = {
      id: "policy_autonomous",
      name: "Autonomous",
      mode: "autonomous",
      maxIterations: 3,
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

    expect(status.run?.status).toBe("blocked");
    expect(status.run?.stopReason).toContain("same verification failure");
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

function handoffCard(): HandoffCard {
  return {
    id: "card_1",
    missionId: "mission_1",
    sourceId: "provider:openai-planner",
    captureId: "artifact_modelResponse",
    targetId: "provider:codex",
    recipe: "implementationBrief",
    taskSpec: taskSpec(),
    generatedPrompt: "Goal:\nDo the thing.",
    redactionFindings: [],
    deliveryAttemptIds: [],
    artifactIds: ["artifact_taskSpec"],
    createdAt: fixedNow(),
    updatedAt: fixedNow()
  };
}

function completionContract(status: CompletionContract["status"]): CompletionContract {
  return {
    id: "contract_1",
    missionId: "mission_1",
    goal: "Do the task.",
    scope: [],
    nonGoals: [],
    acceptanceCriteria: [
      {
        id: "criterion_1",
        statement: "The UI feels better.",
        evidenceRequired: "Human review.",
        verifierKind: "visual",
        required: true
      }
    ],
    verificationMethods: [],
    stopConditions: [],
    humanReviewTriggers: [],
    status,
    createdAt: fixedNow(),
    updatedAt: fixedNow()
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

function failedVerification(id: string): VerificationResult {
  return {
    id,
    missionId: "mission_1",
    status: "failed",
    commandResults: [],
    summary: "Test failed: expected compact workbench layout.",
    artifactIds: [],
    createdAt: fixedNow()
  };
}

function fixedNow(): string {
  return "2026-01-01T00:00:00.000Z";
}
