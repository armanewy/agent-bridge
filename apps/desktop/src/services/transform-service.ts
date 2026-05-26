import { randomUUID } from "node:crypto";
import { transformCapture, type Handoff, type TransformRecipe } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { DeliveryPreview, PreviewRequest } from "./bridge-contract.js";

export class TransformService {
  constructor(private readonly store: LocalStore) {}

  async previewHandoff(input: PreviewRequest): Promise<DeliveryPreview> {
    const capture = await this.store.getCapture(input.captureId);
    if (!capture) {
      throw new Error("Capture not found.");
    }

    const target = await this.store.getTarget(input.targetId);
    const source = await this.store.getSource(capture.sourceId);
    const handoff = this.buildHandoff(capture, input.targetId, input.recipe);

    await this.store.saveHandoff(handoff);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "transformCreated",
      entityId: handoff.id,
      details: { captureId: capture.id, recipe: input.recipe },
      createdAt: new Date().toISOString()
    });

    if (handoff.redactionFindings.length > 0) {
      await this.store.appendAuditEvent({
        id: `audit_${randomUUID()}`,
        type: "redactionWarningShown",
        entityId: handoff.id,
        details: { count: handoff.redactionFindings.length },
        createdAt: new Date().toISOString()
      });
    }

    return {
      handoff,
      ...(source ? { source } : {}),
      ...(target ? { target } : {}),
      originalCaptureExcerpt: capture.text.slice(0, 320),
      deliveryStrategy: target?.kind === "codexDeepLink" ? "codexDeepLink" : "dryRun"
    };
  }

  private buildHandoff(
    capture: Parameters<typeof transformCapture>[0]["capture"],
    targetId: string,
    recipe: TransformRecipe
  ): Handoff {
    return transformCapture({
      id: `handoff_${randomUUID()}`,
      capture,
      targetId,
      recipe
    });
  }
}
