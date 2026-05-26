import { randomUUID } from "node:crypto";
import type { CodexDeepLinkTarget } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexDeliveryResult, HandoffCardDeliveryRequest } from "./bridge-contract.js";
import { CodexTargetService } from "./codex-target-service.js";

export class HandoffCardDeliveryService {
  constructor(
    private readonly store: LocalStore,
    private readonly codexTargetService: CodexTargetService
  ) {}

  async deliverToCodex(input: HandoffCardDeliveryRequest): Promise<CodexDeliveryResult> {
    const card = await this.store.getHandoffCard(input.handoffCardId);
    if (!card || card.missionId !== input.missionId) {
      throw new Error("HandoffCard not found for mission.");
    }

    const target = await this.store.getTarget(card.targetId);
    if (!target || target.kind !== "codexDeepLink") {
      throw new Error("HandoffCard target is not a Codex deep-link target.");
    }

    return this.codexTargetService.deliver({
      target: target as CodexDeepLinkTarget,
      prompt: card.generatedPrompt,
      dryRun: input.dryRun,
      missionId: input.missionId,
      handoffCardId: input.handoffCardId,
      handoffId: `handoff_card_${card.id}_${randomUUID()}`,
      ...(card.codexThreadId ? { codexThreadId: card.codexThreadId } : {}),
      ...(card.codexThreadName ? { codexThreadName: card.codexThreadName } : {}),
      ...(card.codexDeliveryMode ? { codexOpenMode: card.codexDeliveryMode } : {}),
      ...(card.codexIntegrationMode ? { codexIntegrationMode: card.codexIntegrationMode } : {})
    });
  }
}
