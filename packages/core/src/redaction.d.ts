import type { RedactionFinding } from "./types.js";
export declare function detectRedactions(text: string): RedactionFinding[];
export declare function applyRedactions(text: string, findings: RedactionFinding[]): string;
export declare function hasHighSeverityFinding(findings: RedactionFinding[]): boolean;
//# sourceMappingURL=redaction.d.ts.map