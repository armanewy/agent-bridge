import type { PageAdapterResult } from "./types.js";

export function extractLatestChatGptAssistantMessage(root: ParentNode = document): PageAdapterResult {
  const hostname = globalThis.location?.hostname ?? "";
  if (!hostname.includes("chatgpt.com") && !hostname.includes("chat.openai.com")) {
    return { ok: false, error: "unsupportedPageAdapter" };
  }

  const selectors = [
    '[data-message-author-role="assistant"]',
    "[data-testid*='conversation-turn'] [data-message-author-role='assistant']",
    "article:has([data-message-author-role='assistant'])"
  ];

  const candidates = selectors.flatMap((selector) => {
    try {
      return Array.from(root.querySelectorAll<HTMLElement>(selector));
    } catch {
      return [];
    }
  });

  const latest = candidates
    .map((element) => element.innerText.trim())
    .filter(Boolean)
    .at(-1);

  if (!latest) {
    return { ok: false, error: "emptyResult" };
  }

  return { ok: true, text: latest };
}
