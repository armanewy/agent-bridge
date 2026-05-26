import { existsSync, statSync } from "node:fs";
import type { CodexDeepLinkTarget } from "../types.js";

export interface CodexDeepLinkInput {
  prompt: string;
  repoPath: string;
  originUrl?: string;
}

export function validateCodexDeepLinkInput(input: CodexDeepLinkInput): string[] {
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

export function buildCodexDeepLink(input: CodexDeepLinkInput): string {
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

export function createCodexDeepLinkTarget(input: {
  id: string;
  repoPath: string;
  originUrl?: string;
  existingThreadId?: string;
  boundAt?: string;
}): CodexDeepLinkTarget {
  return {
    id: input.id,
    kind: "codexDeepLink",
    repoPath: input.repoPath,
    ...(input.originUrl ? { originUrl: input.originUrl } : {}),
    ...(input.existingThreadId ? { existingThreadId: input.existingThreadId } : {}),
    openMode: "newThread",
    boundAt: input.boundAt ?? new Date().toISOString()
  };
}
