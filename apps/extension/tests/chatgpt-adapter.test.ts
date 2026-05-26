import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { extractLatestChatGptAssistantMessage } from "../src/page-adapters/chatgpt.js";

describe("ChatGPT page adapter", () => {
  beforeEach(() => {
    const dom = new JSDOM(
      `
        <main>
          <div data-message-author-role="assistant">First answer</div>
          <div data-message-author-role="user">User reply</div>
          <div data-message-author-role="assistant">Latest answer</div>
        </main>
      `,
      { url: "https://chatgpt.com/c/example" }
    );
    Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
    Object.defineProperty(globalThis, "location", { value: dom.window.location, configurable: true });
    Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", {
      get() {
        return this.textContent;
      }
    });
  });

  it("extracts the latest assistant message only when user-triggered code invokes it", () => {
    expect(extractLatestChatGptAssistantMessage()).toEqual({ ok: true, text: "Latest answer" });
  });
});
