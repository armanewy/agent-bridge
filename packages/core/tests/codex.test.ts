import { describe, expect, it } from "vitest";
import {
  buildCodexDeepLink,
  buildCodexExistingThreadDeepLink,
  buildCodexNewThreadDeepLink,
  createCodexDeepLinkTarget
} from "../src/targets/codex.js";

describe("Codex deep links", () => {
  it("encodes prompt and repository path", () => {
    const url = buildCodexNewThreadDeepLink({
      prompt: "Fix the parser",
      repoPath: process.cwd()
    });
    const params = new URLSearchParams(url.split("?")[1]);

    expect(url).toContain("codex://threads/new?");
    expect(params.get("prompt")).toBe("Fix the parser");
    expect(params.get("path")).toBe(process.cwd());
  });

  it("rejects empty prompts", () => {
    expect(() => buildCodexDeepLink({ prompt: " ", repoPath: process.cwd() })).toThrow("Prompt cannot be empty");
  });

  it("opens existing threads without prompt or path query params", () => {
    expect(buildCodexExistingThreadDeepLink({ threadId: "thread_123" })).toBe("codex://threads/thread_123");
    expect(buildCodexDeepLink({ openMode: "existingThread", threadId: "thread 123" })).toBe("codex://threads/thread%20123");
  });

  it("creates targets for new or existing Codex threads", () => {
    expect(createCodexDeepLinkTarget({ id: "target_1", repoPath: process.cwd() })).toMatchObject({
      openMode: "newThread",
      integrationMode: "deepLink"
    });
    expect(
      createCodexDeepLinkTarget({
        id: "target_2",
        repoPath: process.cwd(),
        existingThreadId: "thread_123",
        existingThreadName: "Refactor flow",
        integrationMode: "appServer"
      })
    ).toMatchObject({
      existingThreadId: "thread_123",
      existingThreadName: "Refactor flow",
      openMode: "existingThread",
      integrationMode: "appServer"
    });
  });
});
