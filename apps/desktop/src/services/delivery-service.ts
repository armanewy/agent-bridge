import { randomUUID } from "node:crypto";
import type { DeliveryAttempt, Handoff, WindowsDesktopWindowTarget } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import { WindowsTargetService } from "./windows-target-service.js";

export type WindowsDeliveryStrategy = "autoUiaOnly" | "valuePattern" | "clipboardPasteApproved" | "dryRun";

export interface WindowsDeliveryInput {
  target: WindowsDesktopWindowTarget;
  handoff: Handoff;
  strategy: WindowsDeliveryStrategy;
  clipboardFallbackApproved?: boolean;
}

export class DeliveryService {
  constructor(
    private readonly store: LocalStore,
    private readonly windowsTargetService = new WindowsTargetService()
  ) {}

  async deliverToWindows(input: WindowsDeliveryInput): Promise<DeliveryAttempt> {
    if (input.strategy === "clipboardPasteApproved" && input.clipboardFallbackApproved !== true) {
      return this.persistAttempt(input, false, ["Clipboard fallback was not approved."], "Clipboard fallback requires explicit approval.");
    }

    const validation = await this.windowsTargetService.revalidate(input.target);
    if (validation.status === "unavailable") {
      return this.persistAttempt(input, false, validation.warnings, "Target is unavailable.");
    }

    if (validation.status === "changed") {
      return this.persistAttempt(input, false, validation.warnings, "Target metadata changed; rebind or confirm before delivery.");
    }

    const response = await this.windowsTargetService.deliverText(input.target, input.handoff.prompt, input.strategy);
    return this.persistAttempt(
      input,
      response.success,
      response.errors ?? [],
      response.success ? undefined : response.message ?? "Windows delivery failed."
    );
  }

  private async persistAttempt(
    input: WindowsDeliveryInput,
    success: boolean,
    warnings: string[],
    error?: string
  ): Promise<DeliveryAttempt> {
    const attempt: DeliveryAttempt = {
      id: `delivery_${randomUUID()}`,
      handoffId: input.handoff.id,
      targetId: input.target.id,
      strategy: input.strategy,
      success,
      warnings,
      ...(error ? { error } : {}),
      targetMetadata: {
        hwnd: input.target.hwnd,
        title: input.target.title,
        processId: input.target.processId
      },
      attemptedAt: new Date().toISOString()
    };

    await this.store.saveDeliveryAttempt(attempt);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: success ? "deliverySucceeded" : "deliveryFailed",
      entityId: input.handoff.id,
      details: { targetId: input.target.id, strategy: input.strategy, warnings },
      createdAt: attempt.attemptedAt
    });

    return attempt;
  }
}
