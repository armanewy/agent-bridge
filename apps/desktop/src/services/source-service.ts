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

  async bindEmbeddedChatGptSource(input: { title: string; url: string }): Promise<BrowserTabSource> {
    const now = new Date().toISOString();
    const source: BrowserTabSource = {
      id: "src_agentbridge_chatgpt",
      kind: "browserTab",
      browser: "agentbridge",
      title: input.title || "ChatGPT in AgentBridge",
      url: input.url,
      boundAt: now
    };
    await this.store.saveSource(source);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "sourceBound",
      entityId: source.id,
      details: { title: source.title, url: source.url, mode: "embeddedBrowser" },
      createdAt: now
    });
    return source;
  }

  async saveEmbeddedChatGptCapture(input: { text: string; title: string; url: string }): Promise<Capture> {
    const source = await this.bindEmbeddedChatGptSource({ title: input.title, url: input.url });
    const capture: Capture = {
      id: `cap_embedded_${randomUUID()}`,
      sourceId: source.id,
      captureType: "selectedText",
      text: input.text,
      metadata: {
        mode: "embeddedBrowser",
        source: {
          url: source.url,
          title: source.title,
          browser: source.browser
        }
      },
      createdAt: new Date().toISOString(),
      userTriggered: true
    };
    await this.store.saveCapture(capture);
    await this.store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "captureCreated",
      entityId: capture.id,
      details: { sourceId: source.id, captureType: capture.captureType, mode: "embeddedBrowser" },
      createdAt: capture.createdAt
    });
    return capture;
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
