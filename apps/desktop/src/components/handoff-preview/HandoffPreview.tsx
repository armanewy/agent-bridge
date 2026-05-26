import { AlertTriangle, CheckCircle, Send, XCircle } from "lucide-react";
import type { CodexDeepLinkTarget } from "@agentbridge/core";
import type { CodexDeliveryResult, DeliveryPreview } from "../../services/bridge-contract.js";

interface HandoffPreviewProps {
  preview?: DeliveryPreview | undefined;
  deliveryResult?: CodexDeliveryResult | undefined;
  onApproveDryRun(): void;
  onCancel(): void;
}

export function HandoffPreview({
  preview,
  deliveryResult,
  onApproveDryRun,
  onCancel
}: HandoffPreviewProps): JSX.Element {
  if (!preview) {
    return (
      <section className="panel preview-empty">
        <h2>Approval Preview</h2>
        <p>Select a capture, target, and transform recipe to preview the handoff.</p>
      </section>
    );
  }

  const target = preview.target;
  const codexTarget = target?.kind === "codexDeepLink" ? (target as CodexDeepLinkTarget) : undefined;

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <div>
          <h2>Approval Preview</h2>
          <p>Review the source, resolved target, transformed prompt, and warnings before delivery.</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onCancel}>
            <XCircle size={16} />
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={onApproveDryRun} disabled={!codexTarget}>
            <Send size={16} />
            Dry Run Codex
          </button>
        </div>
      </div>

      <div className="preview-grid">
        <div>
          <span className="eyebrow">Source</span>
          <strong>{preview.source?.kind === "browserTab" ? preview.source.title : "Unknown source"}</strong>
          <p>{preview.source?.kind === "browserTab" ? preview.source.url : "No source metadata"}</p>
        </div>
        <div>
          <span className="eyebrow">Target</span>
          <strong>{codexTarget ? "Codex deep link" : target?.kind ?? "No target"}</strong>
          <p>{codexTarget ? codexTarget.repoPath : "Configure a Codex target to enable dry-run delivery."}</p>
        </div>
        <div>
          <span className="eyebrow">Strategy</span>
          <strong>{preview.deliveryStrategy}</strong>
          <p>{preview.handoff.prompt.length} characters</p>
        </div>
      </div>

      {preview.handoff.redactionFindings.length > 0 ? (
        <div className="warning-band">
          <AlertTriangle size={18} />
          <span>{preview.handoff.redactionFindings.length} redaction finding(s) require review before sending.</span>
        </div>
      ) : (
        <div className="ok-band">
          <CheckCircle size={18} />
          <span>No redaction findings in the transformed prompt.</span>
        </div>
      )}

      <div className="prompt-columns">
        <div>
          <span className="eyebrow">Original Capture</span>
          <pre>{preview.originalCaptureExcerpt}</pre>
        </div>
        <div>
          <span className="eyebrow">Transformed Prompt</span>
          <pre>{preview.handoff.prompt}</pre>
        </div>
      </div>

      {deliveryResult ? (
        <div className="result-line">
          <CheckCircle size={16} />
          <span>
            Dry run generated {deliveryResult.promptLength} characters for {deliveryResult.repoPath}.
          </span>
        </div>
      ) : null}
    </section>
  );
}
