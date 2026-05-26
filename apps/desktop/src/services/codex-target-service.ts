import { randomUUID } from "node:crypto";
import {
  buildCodexDeepLink,
  createCodexDeepLinkTarget,
  validateCodexDeepLinkInput,
  type CodexDeepLinkTarget,
  type DeliveryAttempt
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexDeliveryRequest, CodexDeliveryResult } from "./bridge-contract.js";
import type { RepoCommandConfig } from "./repo-context-service.js";
import { repoCommandSettingsKey } from "./repo-context-service.js";

export type OpenExternal = (url: string) => Promise<void>;

export class CodexTargetService {
  constructor(private readonly store: LocalStore, private readonly openExternal?: OpenExternal) {}

  async configureTarget(repoPath: string, commands?: RepoCommandConfig): Promise<CodexDeepLinkTarget> {
    const validationErrors = validateCodexDeepLinkInput({ repoPath, prompt: "validation" });
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(" "));
    }

    const target = createCodexDeepLinkTarget({
      id: `target_codex_${randomUUID()}`,
      repoPath
    });
    if (commands) {
      await this.store.saveSetting(repoCommandSettingsKey(repoPath), commands);
    }
    await this.store.saveTarget(target);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "targetBound",
      entityId: target.id,
      details: { kind: target.kind, repoPath },
      createdAt: new Date().toISOString()
    });
    return target;
  }

  async deliver(input: CodexDeliveryRequest): Promise<CodexDeliveryResult> {
    const attemptedAt = new Date().toISOString();

    try {
      const deepLink = buildCodexDeepLink({
        prompt: input.prompt,
        repoPath: input.target.repoPath,
        ...(input.target.originUrl ? { originUrl: input.target.originUrl } : {})
      });

      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryAttempted",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: "codexDeepLink", dryRun: input.dryRun },
        createdAt: attemptedAt
      });

      if (!input.dryRun) {
        if (!this.openExternal) {
          throw new Error("No opener configured for Codex deep links.");
        }
        await this.openExternal(deepLink);
      }

      const attempt = createAttempt({
        handoffId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        targetId: input.target.id,
        success: true,
        attemptedAt,
        targetMetadata: { repoPath: input.target.repoPath, deepLink, dryRun: input.dryRun }
      });
      await this.store.saveDeliveryAttempt(attempt);
      await this.attachAttemptToMissionGraph(input, attempt.id);
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliverySucceeded",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: "codexDeepLink", dryRun: input.dryRun },
        createdAt: new Date().toISOString()
      });

      return {
        success: true,
        deepLink,
        promptLength: input.prompt.length,
        repoPath: input.target.repoPath,
        ...(input.dryRun ? {} : { openedAt: new Date().toISOString() })
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAttempt = createAttempt({
        handoffId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        targetId: input.target.id,
        success: false,
        attemptedAt,
        error: message,
        targetMetadata: { repoPath: input.target.repoPath, dryRun: input.dryRun }
      });
      await this.store.saveDeliveryAttempt(failedAttempt);
      await this.attachAttemptToHandoffCard(input.handoffCardId, failedAttempt.id);
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryFailed",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: "codexDeepLink", error: message },
        createdAt: new Date().toISOString()
      });
      throw error;
    }
  }

  private async attachAttemptToMissionGraph(input: CodexDeliveryRequest, attemptId: string): Promise<void> {
    await this.attachAttemptToHandoffCard(input.handoffCardId, attemptId);

    if (!input.dryRun) {
      await this.store.updateMissionStatus(input.missionId, "delivered");
    }
  }

  private async attachAttemptToHandoffCard(handoffCardId: string, attemptId: string): Promise<void> {
    const card = await this.store.getHandoffCard(handoffCardId);
    if (card) {
      const now = new Date().toISOString();
      await this.store.saveHandoffCard({
        ...card,
        deliveryAttemptIds: unique([...card.deliveryAttemptIds, attemptId]),
        updatedAt: now
      });
    }
  }
}

function createAttempt(input: {
  handoffId: string;
  missionId: string;
  handoffCardId: string;
  targetId: string;
  success: boolean;
  attemptedAt: string;
  targetMetadata: Record<string, unknown>;
  error?: string;
}): DeliveryAttempt {
  return {
    id: `delivery_${randomUUID()}`,
    handoffId: input.handoffId,
    missionId: input.missionId,
    handoffCardId: input.handoffCardId,
    targetId: input.targetId,
    strategy: "codexDeepLink",
    success: input.success,
    warnings: [],
    ...(input.error ? { error: input.error } : {}),
    targetMetadata: input.targetMetadata,
    attemptedAt: input.attemptedAt
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
