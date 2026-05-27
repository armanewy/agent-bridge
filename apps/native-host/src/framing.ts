export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

export function encodeNativeMessage(message: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  if (json.length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native message exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes.`);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

export interface DecodedFrames {
  messages: unknown[];
  remaining: Buffer<ArrayBufferLike>;
}

export function decodeNativeFrames(buffer: Buffer<ArrayBufferLike>, maxMessageBytes = MAX_NATIVE_MESSAGE_BYTES): DecodedFrames {
  const messages: unknown[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
    if (length > maxMessageBytes) {
      throw new Error(`Native message frame exceeds ${maxMessageBytes} bytes.`);
    }
    const messageStart = offset + 4;
    const messageEnd = messageStart + length;

    if (buffer.length < messageEnd) {
      break;
    }

    const json = buffer.subarray(messageStart, messageEnd).toString("utf8");
    messages.push(JSON.parse(json));
    offset = messageEnd;
  }

  return {
    messages,
    remaining: buffer.subarray(offset)
  };
}
