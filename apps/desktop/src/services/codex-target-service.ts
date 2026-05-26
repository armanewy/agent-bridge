import { randomUUID } from "node:crypto";
import {
  buildCodexDeepLink,
  createCodexDeepLinkTarget,
  validateCodexDeepLinkInput,
  type CodexDeepLinkTarget
} from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexDeliveryRequest, CodexDeliveryResult } from "./bridge-contract.js";

export type OpenExternal = (url: string) => Promise<void>;

export class CodexTargetService {
  constructor(private readonly store: LocalStore, private readonly openExternal?: OpenExternal) {}

  async configureTarget(repoPath: string): Promise<CodexDeepLinkTarget> {
    const validationErrors = validateCodexDeepLinkInput({ repoPath, prompt: "validation" });
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(" "));
    }

    const target = createCodexDeepLinkTarget({
      id: `target_codex_${randomUUID()}`,
      repoPath
    });
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
    const deepLink = buildCodexDeepLink({
      prompt: input.prompt,
      repoPath: input.target.repoPath,
      ...(input.target.originUrl ? { originUrl: input.target.originUrl } : {})
    });

    if (!input.dryRun) {
      if (!this.openExternal) {
        throw new Error("No opener configured for Codex deep links.");
      }
      await this.openExternal(deepLink);
    }

    return {
      success: true,
      deepLink,
      promptLength: input.prompt.length,
      repoPath: input.target.repoPath,
      ...(input.dryRun ? {} : { openedAt: new Date().toISOString() })
    };
  }
}
