#!/usr/bin/env node
import { decodeNativeFrames, encodeNativeMessage } from "./framing.js";
import { appendDevLog } from "./dev-log.js";
import { handleNativeHostMessage } from "./protocol.js";
import { JsonFileStore, defaultAgentBridgeDataDir } from "@agentbridge/local-store";
import { SourceEndpointSchema } from "@agentbridge/core";
import { randomUUID } from "node:crypto";

let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
const store = new JsonFileStore(defaultAgentBridgeDataDir());

process.stdin.on("data", (chunk: Buffer) => {
  void handleChunk(chunk).catch((error: unknown) => {
    process.stdout.write(
      encodeNativeMessage({
        ok: false,
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        receivedAt: new Date().toISOString()
      })
    );
  });
});

async function handleChunk(chunk: Buffer): Promise<void> {
  pending = Buffer.concat([pending, chunk]);
  const decoded = decodeNativeFrames(pending);
  pending = decoded.remaining;

  for (const message of decoded.messages) {
    const response = await handleNativeHostMessage(message, { appendLog: appendDevLog });
    await persistResponse(response);
    process.stdout.write(encodeNativeMessage(response));
  }
}

async function persistResponse(response: Awaited<ReturnType<typeof handleNativeHostMessage>>): Promise<void> {
  if (!response.ok) {
    return;
  }

  if (response.heartbeat) {
    await store.saveExtensionHeartbeat(response.heartbeat);
  }

  if (response.source) {
    await store.saveSource(response.source);
    await store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "sourceBound",
      entityId: response.source.id,
      details: { title: response.source.title, url: response.source.url, receivedFrom: "nativeHost" },
      createdAt: new Date().toISOString()
    });
  }

  if (response.capture) {
    const sourceResult = SourceEndpointSchema.safeParse(response.capture.metadata["source"]);
    if (sourceResult.success) {
      await store.saveSource(sourceResult.data);
    }
    await store.saveCapture(response.capture);
    await store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "captureCreated",
      entityId: response.capture.id,
      details: {
        sourceId: response.capture.sourceId,
        captureType: response.capture.captureType,
        receivedFrom: "nativeHost"
      },
      createdAt: new Date().toISOString()
    });
  }

  if (response.components) {
    for (const component of response.components) {
      await store.saveLinkableComponent(component);
    }
    await store.appendAuditEvent({
      id: `audit_${randomUUID()}`,
      type: "sourceBound",
      entityId: "browserTabsDiscovered",
      details: {
        componentCount: response.components.length,
        receivedFrom: "nativeHost"
      },
      createdAt: new Date().toISOString()
    });
  }
}
