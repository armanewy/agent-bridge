const patterns = [
    {
        kind: "privateKey",
        severity: "high",
        recommendation: "redact",
        pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
    },
    {
        kind: "bearerToken",
        severity: "high",
        recommendation: "redact",
        pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/g
    },
    {
        kind: "apiKey",
        severity: "high",
        recommendation: "redact",
        pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9._-]{16,})/gi
    },
    {
        kind: "envAssignment",
        severity: "medium",
        recommendation: "redact",
        pattern: /\b[A-Z][A-Z0-9_]{2,}\s*=\s*["']?[^"'\s]{8,}/g
    },
    {
        kind: "email",
        severity: "low",
        recommendation: "warn",
        pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
    }
];
export function detectRedactions(text) {
    const findings = [];
    for (const rule of patterns) {
        for (const match of text.matchAll(rule.pattern)) {
            const matched = match[0];
            const start = match.index ?? 0;
            const end = start + matched.length;
            findings.push({
                id: `${rule.kind}-${start}-${end}`,
                kind: rule.kind,
                severity: rule.severity,
                start,
                end,
                preview: preview(matched),
                recommendation: rule.recommendation
            });
        }
    }
    return removeContainedFindings(findings).sort((a, b) => a.start - b.start || b.end - a.end);
}
export function applyRedactions(text, findings) {
    const sorted = [...findings].sort((a, b) => b.start - a.start);
    let output = text;
    for (const finding of sorted) {
        if (finding.start < 0 || finding.end > output.length || finding.start >= finding.end) {
            continue;
        }
        output = `${output.slice(0, finding.start)}[REDACTED:${finding.kind}]${output.slice(finding.end)}`;
    }
    return output;
}
export function hasHighSeverityFinding(findings) {
    return findings.some((finding) => finding.severity === "high");
}
function preview(value) {
    if (value.length <= 12) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
function removeContainedFindings(findings) {
    return findings.filter((candidate, index) => {
        return !findings.some((other, otherIndex) => {
            if (index === otherIndex) {
                return false;
            }
            return other.start <= candidate.start && other.end >= candidate.end && other.end - other.start > candidate.end - candidate.start;
        });
    });
}
//# sourceMappingURL=redaction.js.map