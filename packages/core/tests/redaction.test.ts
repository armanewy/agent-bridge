import { describe, expect, it } from "vitest";
import { applyRedactions, detectRedactions, hasHighSeverityFinding } from "../src/redaction.js";

describe("redaction helpers", () => {
  it("detects high-severity token-like content", () => {
    const findings = detectRedactions("Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("bearerToken");
    expect(findings[0]?.severity).toBe("high");
    expect(hasHighSeverityFinding(findings)).toBe(true);
  });

  it("detects email addresses as low-severity PII", () => {
    const findings = detectRedactions("Contact dev@example.com for details.");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("email");
    expect(findings[0]?.severity).toBe("low");
  });

  it("redacts matched ranges", () => {
    const input = "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz";
    const findings = detectRedactions(input);

    expect(applyRedactions(input, findings)).toContain("[REDACTED:");
  });
});
