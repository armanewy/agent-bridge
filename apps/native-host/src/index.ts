#!/usr/bin/env node
import { decodeNativeFrames, encodeNativeMessage } from "./framing.js";
import { appendDevLog } from "./dev-log.js";
import { handleNativeHostMessage } from "./protocol.js";

let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);

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
    process.stdout.write(encodeNativeMessage(response));
  }
}
