import { randomUUID } from "node:crypto";
import {
  createTaskSpecFromCapture,
  detectRedactions,
  renderTaskSpecForTarget,
  transformCapture,
  type Artifact,
  type Capture,
  type Handoff,
  type HandoffCard,
  type Mission,
  type RepoContextPack,
  type TargetEndpoint,
  type TaskSpec,
  type TransformRecipe
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { DeliveryPreview, PreviewRequest } from "./bridge-contract.js";
import { RepoContextService } from "./repo-context-service.js";

export class TransformService {
  private readonly repoContextService: RepoContextService;

  constructor(private readonly store: LocalStore) {
    this.repoContextService = new RepoContextService(store);
  }

  async previewHandoff(input: PreviewRequest): Promise<DeliveryPreview> {
    const capture = await this.store.getCapture(input.captureId);
    if (!capture) {
      throw new Error("Capture not found.");
    }

    const target = await this.store.getTarget(input.targetId);
    const source = await this.store.getSource(capture.sourceId);
    const repoContext = await this.createRepoContextFromTarget(target);
    const taskSpec = createTaskSpecFromCapture({ capture, recipe: input.recipe });
    const generatedPrompt = renderTaskSpecForTarget(taskSpec, target, repoContext);
    const redactionFindings = detectRedactions(generatedPrompt);
    const now = new Date().toISOString();
    const mission = await this.createOrUpdateMission({
      capture,
      taskSpec,
      ...(input.missionId ? { existingMissionId: input.missionId } : {}),
      ...(repoContext ? { repoContext } : {}),
      now
    });
    const handoffCardId = `card_${randomUUID()}`;
    const artifacts = createPreviewArtifacts({
      missionId: mission.id,
      handoffCardId,
      capture,
      taskSpec,
      generatedPrompt,
      now
    });
    const handoffCard: HandoffCard = {
      id: handoffCardId,
      missionId: mission.id,
      sourceId: capture.sourceId,
      captureId: capture.id,
      targetId: input.targetId,
      recipe: input.recipe,
      taskSpec,
      generatedPrompt,
      ...(repoContext ? { repoContext } : {}),
      redactionFindings,
      deliveryAttemptIds: [],
      artifactIds: artifacts.map((artifact) => artifact.id),
      createdAt: now,
      updatedAt: now
    };
    const updatedMission: Mission = {
      ...mission,
      handoffCardIds: appendUnique(mission.handoffCardIds, handoffCard.id),
      artifactIds: appendUnique(mission.artifactIds, ...artifacts.map((artifact) => artifact.id)),
      updatedAt: now
    };
    const handoff = this.buildHandoff(capture, input.targetId, input.recipe, mission.id, handoffCard.id, target, repoContext);

    await this.store.saveMission(updatedMission);
    for (const artifact of artifacts) {
      await this.store.saveArtifact(artifact);
    }
    await this.store.saveHandoffCard(handoffCard);
    await this.store.saveHandoff(handoff);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "transformCreated",
      entityId: handoff.id,
      missionId: mission.id,
      handoffCardId: handoffCard.id,
      details: { captureId: capture.id, recipe: input.recipe, taskSpecTitle: taskSpec.title },
      createdAt: now
    });

    if (redactionFindings.length > 0) {
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "redactionWarningShown",
        entityId: handoff.id,
        missionId: mission.id,
        handoffCardId: handoffCard.id,
        details: { count: redactionFindings.length },
        createdAt: new Date().toISOString()
      });
    }

    return {
      handoff,
      mission: updatedMission,
      handoffCard,
      taskSpec,
      artifacts,
      ...(source ? { source } : {}),
      ...(target ? { target } : {}),
      originalCaptureExcerpt: capture.text.slice(0, 320),
      deliveryStrategy: target?.kind === "codexDeepLink" ? "codexDeepLink" : "dryRun"
    };
  }

  private buildHandoff(
    capture: Parameters<typeof transformCapture>[0]["capture"],
    targetId: string,
    recipe: TransformRecipe,
    missionId: string,
    handoffCardId: string,
    target?: TargetEndpoint,
    repoContext?: RepoContextPack
  ): Handoff {
    return transformCapture({
      id: `handoff_${randomUUID()}`,
      missionId,
      handoffCardId,
      capture,
      targetId,
      ...(target ? { target } : {}),
      recipe,
      ...(repoContext ? { repoContext } : {})
    });
  }

  private async createOrUpdateMission(input: {
    existingMissionId?: string;
    capture: Capture;
    taskSpec: TaskSpec;
    repoContext?: RepoContextPack;
    now: string;
  }): Promise<Mission> {
    const existing = input.existingMissionId ? await this.store.getMission(input.existingMissionId) : undefined;
    if (existing) {
      return {
        ...existing,
        title: existing.title || input.taskSpec.title,
        goal: existing.goal || input.taskSpec.goal,
        sourceIds: appendUnique(existing.sourceIds, input.capture.sourceId),
        captureIds: appendUnique(existing.captureIds, input.capture.id),
        ...(input.repoContext ? { repoContext: input.repoContext } : {}),
        updatedAt: input.now
      };
    }

    return {
      id: `mission_${randomUUID()}`,
      title: input.taskSpec.title,
      goal: input.taskSpec.goal,
      status: "draft",
      sourceIds: [input.capture.sourceId],
      captureIds: [input.capture.id],
      handoffCardIds: [],
      artifactIds: [],
      runIds: [],
      ...(input.repoContext ? { repoContext: input.repoContext } : {}),
      verificationPlan: {
        commands: [],
        manualChecklist: input.taskSpec.verificationSteps,
        expectedArtifacts: ["generatedPrompt"],
        acceptanceCriteriaRefs: input.taskSpec.acceptanceCriteria
      },
      createdAt: input.now,
      updatedAt: input.now
    };
  }

  private async createRepoContextFromTarget(target?: TargetEndpoint): Promise<RepoContextPack | undefined> {
    if (target?.kind !== "codexDeepLink") {
      return undefined;
    }

    return this.repoContextService.build(target.repoPath);
  }
}

function createPreviewArtifacts(input: {
  missionId: string;
  handoffCardId: string;
  capture: Capture;
  taskSpec: TaskSpec;
  generatedPrompt: string;
  now: string;
}): Artifact[] {
  return [
    {
      id: `artifact_${randomUUID()}`,
      missionId: input.missionId,
      handoffCardId: input.handoffCardId,
      kind: "capture",
      title: "Source capture",
      content: input.capture.text,
      metadata: { captureId: input.capture.id, captureType: input.capture.captureType },
      createdAt: input.now
    },
    {
      id: `artifact_${randomUUID()}`,
      missionId: input.missionId,
      handoffCardId: input.handoffCardId,
      kind: "taskSpec",
      title: "TaskSpec",
      content: JSON.stringify(input.taskSpec, null, 2),
      metadata: {},
      createdAt: input.now
    },
    {
      id: `artifact_${randomUUID()}`,
      missionId: input.missionId,
      handoffCardId: input.handoffCardId,
      kind: "generatedPrompt",
      title: "Generated prompt",
      content: input.generatedPrompt,
      metadata: {},
      createdAt: input.now
    }
  ];
}

function appendUnique(values: string[], ...nextValues: string[]): string[] {
  return [...new Set([...values, ...nextValues])];
}
