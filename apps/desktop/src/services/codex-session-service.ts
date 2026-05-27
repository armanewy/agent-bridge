import type { CodexThreadRef } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { CodexAppServerClient, CodexAppServerThread } from "./codex-app-server-client.js";

export class CodexSessionService {
  constructor(
    private readonly store: LocalStore,
    private readonly appServerClient?: CodexAppServerClient
  ) {}

  async listCodexThreads(repoPath?: string): Promise<CodexThreadRef[]> {
    const refreshed = await this.refreshCodexThreads(repoPath);
    const saved = await this.listSavedCodexThreadRefs(repoPath);
    return mergeThreadRefs([...refreshed, ...saved], repoPath);
  }

  async getCodexThreadRef(threadId: string): Promise<CodexThreadRef | undefined> {
    return this.store.getCodexThreadRef(threadId);
  }

  async listSavedCodexThreadRefs(repoPath?: string): Promise<CodexThreadRef[]> {
    return mergeThreadRefs(await this.store.listCodexThreadRefs(repoPath), repoPath);
  }

  async refreshCodexThreads(repoPath?: string): Promise<CodexThreadRef[]> {
    if (!this.appServerClient) {
      return [];
    }

    const now = new Date().toISOString();
    const refs: CodexThreadRef[] = [];

    try {
      const [threads, loadedThreads] = await Promise.allSettled([
        this.appServerClient.listThreads(repoPath ? { cwd: repoPath } : {}),
        this.appServerClient.listLoadedThreads()
      ]);

      if (threads.status === "fulfilled") {
        refs.push(...threads.value.map((thread) => appServerThreadToRef(thread, now)));
      }
      if (loadedThreads.status === "fulfilled") {
        refs.push(...loadedThreads.value.map((thread) => appServerThreadToRef(thread, now)));
      }
    } catch {
      return [];
    }

    const merged = mergeThreadRefs(refs, repoPath);
    for (const ref of merged) {
      await this.store.saveCodexThreadRef(ref);
    }
    return merged;
  }
}

function appServerThreadToRef(thread: CodexAppServerThread, lastSeenAt: string): CodexThreadRef {
  return {
    id: `codex_thread_${thread.threadId}`,
    threadId: thread.threadId,
    ...(thread.name ? { name: thread.name } : {}),
    ...(thread.cwd ? { repoPath: thread.cwd } : {}),
    status: thread.status ?? "unknown",
    source: "appServer",
    lastSeenAt,
    metadata: thread.metadata
  };
}

function mergeThreadRefs(refs: CodexThreadRef[], repoPath?: string): CodexThreadRef[] {
  const byThreadId = new Map<string, CodexThreadRef>();
  for (const ref of refs) {
    if (!ref.threadId) {
      continue;
    }
    const previous = byThreadId.get(ref.threadId);
    if (!previous || previous.lastSeenAt.localeCompare(ref.lastSeenAt) < 0 || previous.source !== "appServer") {
      byThreadId.set(ref.threadId, ref);
    }
  }

  return [...byThreadId.values()].sort((a, b) => {
    const aRepoMatch = repoPath && normalizePath(a.repoPath) === normalizePath(repoPath);
    const bRepoMatch = repoPath && normalizePath(b.repoPath) === normalizePath(repoPath);
    if (aRepoMatch !== bRepoMatch) {
      return aRepoMatch ? -1 : 1;
    }
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

function normalizePath(value?: string): string | undefined {
  return value?.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
