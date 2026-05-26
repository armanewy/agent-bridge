import { randomUUID } from "node:crypto";
import type { Capture, SourceEndpoint, BrowserTabSource } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export class SourceService {
  constructor(private readonly store: LocalStore) {}

  async listSources(): Promise<SourceEndpoint[]> {
    return this.store.listSources();
  }

  async listRecentCaptures(): Promise<Capture[]> {
    return this.store.listRecentCaptures();
  }

  async bindMockBrowserSource(): Promise<BrowserTabSource> {
    const source = createMockBrowserSource();
    const capture = createMockCapture(source.id);
    await this.store.saveSource(source);
    await this.store.saveCapture(capture);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "sourceBound",
      entityId: source.id,
      details: { title: source.title, url: source.url, mode: "mock" },
      createdAt: new Date().toISOString()
    });
    return source;
  }
}

export function createMockBrowserSource(): BrowserTabSource {
  return {
    id: "src_mock_browser",
    kind: "browserTab",
    browser: "chrome",
    title: "Captured browser tab",
    url: "https://chatgpt.com/",
    boundAt: new Date().toISOString()
  };
}

export function createMockCapture(sourceId: string): Capture {
  return {
    id: "cap_mock_selection",
    sourceId,
    captureType: "selectedText",
    text: "Implement the AgentBridge approval preview so a captured browser selection becomes a structured handoff before delivery.",
    metadata: { mode: "mock" },
    createdAt: new Date().toISOString(),
    userTriggered: true
  };
}
