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
    const handoffId = input.handoffId ?? "handoff_unknown";

    try {
      const deepLink = buildCodexDeepLink({
        prompt: input.prompt,
        repoPath: input.target.repoPath,
        ...(input.target.originUrl ? { originUrl: input.target.originUrl } : {})
      });

      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryAttempted",
        entityId: handoffId,
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
        handoffId,
        targetId: input.target.id,
        success: true,
        attemptedAt,
        targetMetadata: { repoPath: input.target.repoPath, deepLink, dryRun: input.dryRun }
      });
      await this.store.saveDeliveryAttempt(attempt);
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliverySucceeded",
        entityId: handoffId,
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
      await this.store.saveDeliveryAttempt(
        createAttempt({
          handoffId,
          targetId: input.target.id,
          success: false,
          attemptedAt,
          error: message,
          targetMetadata: { repoPath: input.target.repoPath, dryRun: input.dryRun }
        })
      );
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryFailed",
        entityId: handoffId,
        details: { targetId: input.target.id, strategy: "codexDeepLink", error: message },
        createdAt: new Date().toISOString()
      });
      throw error;
    }
  }
}

function createAttempt(input: {
  handoffId: string;
  targetId: string;
  success: boolean;
  attemptedAt: string;
  targetMetadata: Record<string, unknown>;
  error?: string;
}): DeliveryAttempt {
  return {
    id: `delivery_${randomUUID()}`,
    handoffId: input.handoffId,
    targetId: input.targetId,
    strategy: "codexDeepLink",
    success: input.success,
    warnings: [],
    ...(input.error ? { error: input.error } : {}),
    targetMetadata: input.targetMetadata,
    attemptedAt: input.attemptedAt
  };
}
