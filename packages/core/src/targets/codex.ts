import { existsSync, statSync } from "node:fs";
import type { CodexDeepLinkTarget } from "../types.js";

export interface CodexNewThreadDeepLinkInput {
  prompt: string;
  repoPath: string;
  originUrl?: string;
}

export interface CodexExistingThreadDeepLinkInput {
  threadId: string;
}

export type CodexDeepLinkInput =
  | (CodexNewThreadDeepLinkInput & { openMode?: "newThread" })
  | (CodexExistingThreadDeepLinkInput & { openMode: "existingThread" });

export function validateCodexDeepLinkInput(input: CodexNewThreadDeepLinkInput): string[] {
  const errors: string[] = [];

  if (!input.prompt.trim()) {
    errors.push("Prompt cannot be empty.");
  }

  if (!input.repoPath.trim()) {
    errors.push("Repository path is required.");
  } else if (!existsSync(input.repoPath)) {
    errors.push("Repository path does not exist.");
  } else if (!statSync(input.repoPath).isDirectory()) {
    errors.push("Repository path must be a directory.");
  }

  return errors;
}

export function buildCodexNewThreadDeepLink(input: CodexNewThreadDeepLinkInput): string {
  const errors = validateCodexDeepLinkInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  const params = new URLSearchParams();
  params.set("prompt", input.prompt);
  params.set("path", input.repoPath);
  if (input.originUrl) {
    params.set("originUrl", input.originUrl);
  }

  return `codex://threads/new?${params.toString()}`;
}

export function buildCodexExistingThreadDeepLink(input: CodexExistingThreadDeepLinkInput): string {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new Error("Codex thread ID is required.");
  }

  return `codex://threads/${encodeURIComponent(threadId)}`;
}

export function buildCodexDeepLink(input: CodexDeepLinkInput): string {
  if (input.openMode === "existingThread") {
    return buildCodexExistingThreadDeepLink(input);
  }

  return buildCodexNewThreadDeepLink(input);
}

export function createCodexDeepLinkTarget(input: {
  id: string;
  repoPath: string;
  originUrl?: string;
  existingThreadId?: string;
  existingThreadName?: string;
  openMode?: "newThread" | "existingThread";
  integrationMode?: "deepLink" | "appServer" | "sdk";
  boundAt?: string;
}): CodexDeepLinkTarget {
  const openMode = input.openMode ?? (input.existingThreadId ? "existingThread" : "newThread");

  return {
    id: input.id,
    kind: "codexDeepLink",
    repoPath: input.repoPath,
    ...(input.originUrl ? { originUrl: input.originUrl } : {}),
    ...(input.existingThreadId ? { existingThreadId: input.existingThreadId } : {}),
    ...(input.existingThreadName ? { existingThreadName: input.existingThreadName } : {}),
    openMode,
    integrationMode: input.integrationMode ?? "deepLink",
    boundAt: input.boundAt ?? new Date().toISOString()
  };
}
