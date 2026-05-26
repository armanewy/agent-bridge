import { describe, expect, it } from "vitest";
import { buildCodexDeepLink } from "../src/targets/codex.js";

describe("Codex deep links", () => {
  it("encodes prompt and repository path", () => {
    const url = buildCodexDeepLink({
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
});
