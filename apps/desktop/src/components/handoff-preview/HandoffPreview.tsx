import { AlertTriangle, CheckCircle, Send, XCircle } from "lucide-react";
import type { CodexDeepLinkTarget } from "@agentbridge/core";
import type { CodexDeliveryResult, DeliveryPreview } from "../../services/bridge-contract.js";

interface HandoffPreviewProps {
  preview?: DeliveryPreview | undefined;
  deliveryResult?: CodexDeliveryResult | undefined;
  onApproveDryRun(): void;
  onApproveSend(): void;
  onSaveDraft(): void;
  onCancel(): void;
}

export function HandoffPreview({
  preview,
  deliveryResult,
  onApproveDryRun,
  onApproveSend,
  onSaveDraft,
  onCancel
}: HandoffPreviewProps): JSX.Element {
  if (!preview) {
    return (
      <section className="panel preview-empty">
        <h2>Task Card Preview</h2>
        <p>Select a capture and repo, then create a Task Card to review before sending.</p>
      </section>
    );
  }

  const target = preview.target;
  const codexTarget = target?.kind === "codexDeepLink" ? (target as CodexDeepLinkTarget) : undefined;

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <div>
          <h2>Task Card Preview</h2>
          <p>Review the scoped task before Codex opens with the generated prompt.</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onCancel}>
            <XCircle size={16} />
            Cancel
          </button>
          <button type="button" className="secondary-button" onClick={onSaveDraft}>
            Save Draft
          </button>
          <button type="button" className="primary-button" onClick={onApproveDryRun} disabled={!codexTarget}>
            <Send size={16} />
            Dry run
          </button>
          <button type="button" className="primary-button" onClick={onApproveSend} disabled={!codexTarget}>
            <Send size={16} />
            Send to Codex
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
          <strong>{codexTarget ? "Codex" : target?.kind ?? "No target"}</strong>
          <p>{codexTarget ? codexTarget.repoPath : "Configure a Codex target to enable dry-run delivery."}</p>
        </div>
        <div>
          <span className="eyebrow">Verification</span>
          <strong>{preview.handoffCard.repoContext?.testCommand ?? preview.handoffCard.repoContext?.typecheckCommand ?? "Not configured"}</strong>
          <p>{preview.taskSpec.verificationSteps.length} planned step(s)</p>
        </div>
        <div>
          <span className="eyebrow">Task Card</span>
          <strong>{preview.mission.title}</strong>
          <p>{preview.mission.status}</p>
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

      <div className="next-steps-panel">
        <span className="eyebrow">What will happen next?</span>
        <ul>
          <li>Codex opens with this prompt and repo path.</li>
          <li>AgentBridge saves the Task Card, delivery attempt, and prompt artifact.</li>
          <li>You can run verification afterward and send a follow-up if needed.</li>
        </ul>
      </div>

      <div className="task-spec-grid">
        <SpecSection title="Goal" items={[preview.taskSpec.goal]} />
        {preview.handoffCard.repoContext ? (
          <SpecSection
            title="Repo Context"
            items={[
              `Path: ${preview.handoffCard.repoContext.repoPath}`,
              preview.handoffCard.repoContext.currentBranch ? `Branch: ${preview.handoffCard.repoContext.currentBranch}` : "Branch: unknown",
              preview.handoffCard.repoContext.gitStatusSummary
                ? `Status: ${preview.handoffCard.repoContext.gitStatusSummary}`
                : "Status: unknown",
              preview.handoffCard.repoContext.changedFiles?.length
                ? `Changed files: ${preview.handoffCard.repoContext.changedFiles.join(", ")}`
                : "Changed files: none",
              preview.handoffCard.repoContext.testCommand ? `Test: ${preview.handoffCard.repoContext.testCommand}` : "Test: not configured",
              preview.handoffCard.repoContext.lintCommand ? `Lint: ${preview.handoffCard.repoContext.lintCommand}` : "Lint: not configured",
              preview.handoffCard.repoContext.typecheckCommand
                ? `Typecheck: ${preview.handoffCard.repoContext.typecheckCommand}`
                : "Typecheck: not configured"
            ]}
          />
        ) : null}
        <SpecSection title="Requirements" items={preview.taskSpec.requirements} />
        <SpecSection title="Constraints" items={preview.taskSpec.constraints} />
        <SpecSection title="Acceptance Criteria" items={preview.taskSpec.acceptanceCriteria} />
        <SpecSection title="Verification Steps" items={preview.taskSpec.verificationSteps} />
      </div>

      <details className="advanced-details">
        <summary>Advanced details</summary>
        <div className="prompt-columns">
          <div>
            <span className="eyebrow">Original Capture</span>
            <pre>{preview.originalCaptureExcerpt}</pre>
          </div>
          <div>
            <span className="eyebrow">Generated Prompt</span>
            <pre>{preview.handoffCard.generatedPrompt}</pre>
          </div>
        </div>
        {preview.handoff.redactionFindings.length > 0 ? (
          <div className="redaction-list">
            <span className="eyebrow">Redaction findings</span>
            {preview.handoff.redactionFindings.map((finding) => (
              <article className="list-card" key={finding.id}>
                <strong>{finding.kind}</strong>
                <span>
                  {finding.severity} - {finding.recommendation}
                </span>
              </article>
            ))}
          </div>
        ) : null}
      </details>

      {deliveryResult ? (
        <div className="result-line">
          <CheckCircle size={16} />
          <span>
            {deliveryResult.openedAt ? "Opened Codex deep link" : "Dry run generated"} {deliveryResult.promptLength} characters for {deliveryResult.repoPath}.
          </span>
        </div>
      ) : null}
    </section>
  );
}

function SpecSection({ title, items }: { title: string; items: string[] }): JSX.Element {
  return (
    <div className="spec-section">
      <span className="eyebrow">{title}</span>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
