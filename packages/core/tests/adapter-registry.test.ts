import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../src/adapter-registry.js";

describe("AdapterRegistry", () => {
  it("registers and filters adapters", () => {
    const registry = new AdapterRegistry();
    registry.register({
      id: "browserTab",
      kind: "source",
      label: "Browser tab",
      capabilities: { canCaptureSelectedText: true },
      health: async () => ({ available: true })
    });

    expect(registry.list("source")).toHaveLength(1);
    expect(registry.get("browserTab")?.capabilities.canCaptureSelectedText).toBe(true);
  });
});
