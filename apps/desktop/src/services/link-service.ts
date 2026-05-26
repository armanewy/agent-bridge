import { randomUUID } from "node:crypto";
import type { Link } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export class LinkService {
  constructor(private readonly store: LocalStore) {}

  async listLinks(): Promise<Link[]> {
    return this.store.listLinks();
  }

  async createLink(input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled">): Promise<Link> {
    const now = new Date().toISOString();
    const link: Link = {
      id: `link_${randomUUID()}`,
      ...input,
      createdAt: now,
      updatedAt: now,
      enabled: true
    };

    await this.store.saveLink(link);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "targetBound",
      entityId: link.targetId,
      details: { linkId: link.id, sourceId: link.sourceId, transformId: link.transformId },
      createdAt: now
    });

    return link;
  }
}
