import { randomUUID } from "node:crypto";
import type { Capture, LinkableComponent, VerificationCommand, WorkflowLink } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { TransformService } from "./transform-service.js";
import type { DeliveryPreview } from "./bridge-contract.js";

export interface CreateWorkflowLinkInput {
  name: string;
  sourceComponentId: string;
  workspaceComponentId?: string;
  targetComponentId: string;
  recipe: WorkflowLink["recipe"];
  verificationCommandDefaults?: VerificationCommand[];
}

export interface CreateTaskFromWorkflowLinkInput {
  workflowLinkId: string;
}

export class WorkflowLinkService {
  constructor(
    private readonly store: LocalStore,
    private readonly transformService: TransformService
  ) {}

  async listWorkflowLinks(): Promise<WorkflowLink[]> {
    return this.store.listWorkflowLinks();
  }

  async createWorkflowLink(input: CreateWorkflowLinkInput): Promise<WorkflowLink> {
    const source = await this.store.getLinkableComponent(input.sourceComponentId);
    const target = await this.store.getLinkableComponent(input.targetComponentId);
    const workspace = input.workspaceComponentId ? await this.store.getLinkableComponent(input.workspaceComponentId) : undefined;

    if (!source?.roleCapabilities.canBeSource) {
      throw new Error("Choose a source component that can capture work.");
    }
    if (!target?.roleCapabilities.canBeTarget) {
      throw new Error("Choose a target component that can receive work.");
    }
    if (target.provider === "codex" && !workspace?.roleCapabilities.canBeWorkspace) {
      throw new Error("Codex links need a repo workspace.");
    }

    const now = new Date().toISOString();
    const link: WorkflowLink = {
      id: `workflow_${randomUUID()}`,
      name: input.name,
      sourceComponentId: input.sourceComponentId,
      ...(input.workspaceComponentId ? { workspaceComponentId: input.workspaceComponentId } : {}),
      targetComponentId: input.targetComponentId,
      recipe: input.recipe,
      verificationCommandDefaults: input.verificationCommandDefaults ?? [],
      enabled: true,
      createdAt: now,
      updatedAt: now
    };

    await this.store.saveWorkflowLink(link);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "targetBound",
      entityId: link.id,
      details: {
        workflowLinkId: link.id,
        sourceComponentId: link.sourceComponentId,
        workspaceComponentId: link.workspaceComponentId,
        targetComponentId: link.targetComponentId
      },
      createdAt: now
    });

    return link;
  }

  async createTaskFromWorkflowLink(input: CreateTaskFromWorkflowLinkInput): Promise<DeliveryPreview> {
    const link = await this.store.getWorkflowLink(input.workflowLinkId);
    if (!link?.enabled) {
      throw new Error("Workflow link is not available.");
    }

    const sourceComponent = await this.store.getLinkableComponent(link.sourceComponentId);
    const targetComponent = await this.store.getLinkableComponent(link.targetComponentId);
    const targetId = targetComponent?.backingRef.targetId;

    if (!sourceComponent) {
      throw new Error("Link source does not have a saved browser source. Capture selected text first.");
    }
    if (!targetId) {
      throw new Error("Link target is not bound to a saved target.");
    }

    const capture = await this.latestCaptureForComponent(sourceComponent);
    if (!capture) {
      throw new Error("Capture selected text first before creating a Task Card from this link.");
    }

    return this.transformService.previewHandoff({
      captureId: capture.id,
      targetId,
      recipe: link.recipe
    });
  }

  private async latestCaptureForComponent(component: LinkableComponent): Promise<Capture | undefined> {
    const captures = await this.store.listRecentCaptures(50);
    const sourceId = component.backingRef.sourceId;
    const tabId = component.backingRef.tabId;
    const url = typeof component.metadata["url"] === "string" ? component.metadata["url"] : undefined;

    return captures.find((capture) => {
      if (sourceId && capture.sourceId === sourceId) {
        return true;
      }

      const source = capture.metadata["source"];
      if (!isRecord(source)) {
        return false;
      }

      return (typeof tabId === "number" && source.tabId === tabId) || (typeof url === "string" && source.url === url);
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
