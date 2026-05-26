export function encodeNativeMessage(message: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

export interface DecodedFrames {
  messages: unknown[];
  remaining: Buffer<ArrayBufferLike>;
}

export function decodeNativeFrames(buffer: Buffer<ArrayBufferLike>): DecodedFrames {
  const messages: unknown[] = [];
  let offset = 0;

  while (buffer.length - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
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
