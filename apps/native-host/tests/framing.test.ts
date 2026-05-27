import { describe, expect, it } from "vitest";
import { decodeNativeFrames, encodeNativeMessage } from "../src/framing.js";

describe("native messaging framing", () => {
  it("encodes and decodes one message", () => {
    const frame = encodeNativeMessage({ type: "healthCheck" });
    const decoded = decodeNativeFrames(frame);

    expect(decoded.messages).toEqual([{ type: "healthCheck" }]);
    expect(decoded.remaining.length).toBe(0);
  });

  it("keeps partial frames in remaining", () => {
    const frame = encodeNativeMessage({ type: "healthCheck" });
    const partial = frame.subarray(0, frame.length - 2);
    const decoded = decodeNativeFrames(partial);

    expect(decoded.messages).toEqual([]);
    expect(decoded.remaining).toEqual(partial);
  });

  it("rejects oversized frames", () => {
    const frame = Buffer.alloc(4);
    frame.writeUInt32LE(1025, 0);

    expect(() => decodeNativeFrames(frame, 1024)).toThrow("exceeds");
  });
});
