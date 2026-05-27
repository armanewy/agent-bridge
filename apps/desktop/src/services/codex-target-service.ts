import { randomUUID } from "node:crypto";
import {
  buildCodexExistingThreadDeepLink,
  buildCodexNewThreadDeepLink,
  createCodexDeepLinkTarget,
  validateCodexDeepLinkInput,
  type CodexIntegrationMode,
  type CodexDeepLinkTarget,
  type CodexOpenMode,
  type DeliveryAttempt
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexDeliveryRequest, CodexDeliveryResult } from "./bridge-contract.js";
import type { CodexAppServerClient } from "./codex-app-server-client.js";
import type { RepoCommandConfig } from "./repo-context-service.js";
import { repoCommandSettingsKey } from "./repo-context-service.js";

export type OpenExternal = (url: string) => Promise<void>;
type CodexDeliveryMode = NonNullable<CodexDeliveryResult["deliveryMode"]>;

export interface CodexTargetServiceOptions {
  canUseCodexDeepLinks?: boolean;
  platform?: string;
}

export class CodexTargetService {
  constructor(
    private readonly store: LocalStore,
    private readonly openExternal?: OpenExternal,
    private readonly appServerClient?: CodexAppServerClient,
    private readonly options: CodexTargetServiceOptions = {}
  ) {}

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
    const route = resolveCodexRoute(input);

    try {
      const delivery = await this.prepareDelivery(input, route);

      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryAttempted",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: strategyForRoute(route.deliveryMode), deliveryMode: route.deliveryMode, dryRun: input.dryRun },
        createdAt: attemptedAt
      });

      const attempt = createAttempt({
        handoffId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        targetId: input.target.id,
        strategy: strategyForRoute(route.deliveryMode),
        success: true,
        attemptedAt,
        warnings: delivery.warnings,
        targetMetadata: {
          repoPath: input.target.repoPath,
          deepLink: delivery.deepLink,
          dryRun: input.dryRun,
          deliveryMode: route.deliveryMode,
          codexThreadId: route.threadId,
          codexTurnId: delivery.codexTurnId
        }
      });
      await this.store.saveDeliveryAttempt(attempt);
      await this.attachAttemptToMissionGraph(input, attempt.id, delivery.markDelivered);
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliverySucceeded",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: strategyForRoute(route.deliveryMode), deliveryMode: route.deliveryMode, dryRun: input.dryRun },
        createdAt: new Date().toISOString()
      });

      return {
        success: true,
        deepLink: delivery.deepLink,
        promptLength: input.prompt.length,
        repoPath: input.target.repoPath,
        deliveryMode: route.deliveryMode,
        ...(route.threadId ? { codexThreadId: route.threadId } : {}),
        ...(delivery.codexTurnId ? { codexTurnId: delivery.codexTurnId } : {}),
        ...(delivery.warnings.length > 0 ? { warnings: delivery.warnings } : {}),
        ...(input.dryRun ? {} : { openedAt: new Date().toISOString() })
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAttempt = createAttempt({
        handoffId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        targetId: input.target.id,
        strategy: strategyForRoute(route.deliveryMode),
        success: false,
        attemptedAt,
        error: message,
        targetMetadata: {
          repoPath: input.target.repoPath,
          dryRun: input.dryRun,
          deliveryMode: route.deliveryMode,
          codexThreadId: route.threadId
        }
      });
      await this.store.saveDeliveryAttempt(failedAttempt);
      await this.attachAttemptToHandoffCard(input.handoffCardId, failedAttempt.id);
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "deliveryFailed",
        entityId: input.handoffId,
        missionId: input.missionId,
        handoffCardId: input.handoffCardId,
        details: { targetId: input.target.id, strategy: strategyForRoute(route.deliveryMode), deliveryMode: route.deliveryMode, error: message },
        createdAt: new Date().toISOString()
      });
      throw error;
    }
  }

  private async prepareDelivery(
    input: CodexDeliveryRequest,
    route: ResolvedCodexRoute
  ): Promise<{ deepLink: string; codexTurnId?: string; warnings: string[]; markDelivered: boolean }> {
    if (route.openMode === "newThread") {
      this.assertDeepLinksAvailable("New Codex thread delivery requires Codex deep-link support on this platform.");
      const deepLink = buildCodexNewThreadDeepLink({
        prompt: input.prompt,
        repoPath: input.target.repoPath,
        ...(input.target.originUrl ? { originUrl: input.target.originUrl } : {})
      });
      if (!input.dryRun) {
        await this.openDeepLink(deepLink);
      }
      return {
        deepLink,
        warnings: input.dryRun
          ? []
          : ["Opened Codex new-thread link only. AgentBridge cannot confirm a Codex chat or turn started without Codex App Server."],
        markDelivered: false
      };
    }

    if (!route.threadId) {
      throw new Error("Existing Codex thread delivery requires a thread ID.");
    }

    const deepLink = buildCodexExistingThreadDeepLink({ threadId: route.threadId });

    if (route.deliveryMode === "sdkRun") {
      throw new Error("Codex SDK existing-thread delivery is not implemented yet.");
    }

    if (route.deliveryMode === "appServerTurnStart") {
      if (input.dryRun) {
        return { deepLink, warnings: [], markDelivered: false };
      }
      if (!this.appServerClient) {
        throw new Error("Codex App Server is not configured, so AgentBridge cannot send into an existing Codex thread.");
      }
      await this.appServerClient.resumeThread(route.threadId, { cwd: input.target.repoPath });
      const turn = await this.appServerClient.startTurn(route.threadId, input.prompt, { cwd: input.target.repoPath });
      return { deepLink, ...(turn.turnId ? { codexTurnId: turn.turnId } : {}), warnings: [], markDelivered: true };
    }

    if (!input.dryRun) {
      this.assertDeepLinksAvailable("Opening an existing Codex thread requires Codex deep-link support on this platform.");
      await this.openDeepLink(deepLink);
    }

    return {
      deepLink,
      warnings: ["Opened existing Codex thread only. Prompt was staged in AgentBridge but not sent into the existing thread."],
      markDelivered: false
    };
  }

  private async openDeepLink(deepLink: string): Promise<void> {
    if (!this.openExternal) {
      throw new Error("No opener configured for Codex deep links.");
    }
    await this.openExternal(deepLink);
  }

  private assertDeepLinksAvailable(message: string): void {
    if (this.options.canUseCodexDeepLinks === false) {
      throw new Error(`${message} Platform: ${this.options.platform ?? "unknown"}.`);
    }
  }

  private async attachAttemptToMissionGraph(input: CodexDeliveryRequest, attemptId: string, markDelivered: boolean): Promise<void> {
    await this.attachAttemptToHandoffCard(input.handoffCardId, attemptId);

    if (markDelivered) {
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
  strategy: DeliveryAttempt["strategy"];
  success: boolean;
  attemptedAt: string;
  targetMetadata: Record<string, unknown>;
  warnings?: string[];
  error?: string;
}): DeliveryAttempt {
  return {
    id: `delivery_${randomUUID()}`,
    handoffId: input.handoffId,
    missionId: input.missionId,
    handoffCardId: input.handoffCardId,
    targetId: input.targetId,
    strategy: input.strategy,
    success: input.success,
    warnings: input.warnings ?? [],
    ...(input.error ? { error: input.error } : {}),
    targetMetadata: input.targetMetadata,
    attemptedAt: input.attemptedAt
  };
}

function strategyForRoute(deliveryMode: CodexDeliveryMode): DeliveryAttempt["strategy"] {
  const strategies: Record<CodexDeliveryMode, DeliveryAttempt["strategy"]> = {
    newDeepLink: "newCodexDeepLink",
    existingDeepLinkOpen: "existingCodexDeepLinkOpen",
    appServerTurnStart: "codexAppServerTurnStart",
    sdkRun: "codexSdkRun"
  };
  return strategies[deliveryMode];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

interface ResolvedCodexRoute {
  openMode: CodexOpenMode;
  integrationMode: CodexIntegrationMode;
  deliveryMode: CodexDeliveryMode;
  threadId?: string;
}

function resolveCodexRoute(input: CodexDeliveryRequest): ResolvedCodexRoute {
  const threadId = input.codexThreadId ?? input.target.existingThreadId;
  const openMode = input.codexOpenMode ?? input.target.openMode ?? (threadId ? "existingThread" : "newThread");
  const integrationMode = input.codexIntegrationMode ?? input.target.integrationMode ?? "deepLink";

  if (openMode === "existingThread") {
    return {
      openMode,
      integrationMode,
      deliveryMode: integrationMode === "appServer" ? "appServerTurnStart" : integrationMode === "sdk" ? "sdkRun" : "existingDeepLinkOpen",
      ...(threadId ? { threadId } : {})
    };
  }

  return {
    openMode: "newThread",
    integrationMode,
    deliveryMode: "newDeepLink"
  };
}
