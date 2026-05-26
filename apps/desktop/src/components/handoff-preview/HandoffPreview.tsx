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
  const deliveryMode = describePreviewDeliveryMode(preview);

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <div>
          <h2>Task Card Preview</h2>
          <p>Review the scoped task and exact Codex delivery mode before sending.</p>
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
          <strong>{sourceTitle(preview)}</strong>
          <p>{sourceDetail(preview)}</p>
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
        <div>
          <span className="eyebrow">Delivery Mode</span>
          <strong>{deliveryMode.title}</strong>
          <p>{deliveryMode.detail}</p>
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
          {deliveryMode.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li>AgentBridge saves the Task Card, delivery attempt, and prompt artifact.</li>
          <li>You can run verification afterward and send a follow-up if needed.</li>
        </ul>
      </div>

      {deliveryMode.warning ? (
        <div className="warning-band">
          <AlertTriangle size={18} />
          <span>{deliveryMode.warning}</span>
        </div>
      ) : null}

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
        <DeliveryResultLine result={deliveryResult} />
      ) : null}
    </section>
  );
}

function DeliveryResultLine({ result }: { result: CodexDeliveryResult }): JSX.Element {
  const mode = deliveryResultMode(result);
  return (
    <div className={result.warnings?.length ? "result-line warning" : "result-line"}>
      {result.warnings?.length ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
      <span>
        {mode} · {result.promptLength} characters · {result.repoPath}
        {result.codexThreadId ? ` · thread ${shortId(result.codexThreadId)}` : ""}
        {result.codexTurnId ? ` · turn ${shortId(result.codexTurnId)}` : ""}
        {result.warnings?.length ? ` · ${result.warnings.join(" ")}` : ""}
      </span>
    </div>
  );
}

function sourceTitle(preview: DeliveryPreview): string {
  if (preview.source?.kind === "browserTab") {
    return preview.source.title;
  }
  if (preview.source?.kind === "chatgptDesktop") {
    return preview.source.sessionTitle ?? preview.source.windowTitle ?? "ChatGPT Desktop";
  }
  return "Unknown source";
}

function sourceDetail(preview: DeliveryPreview): string {
  if (preview.source?.kind === "browserTab") {
    return preview.source.url;
  }
  if (preview.source?.kind === "chatgptDesktop") {
    return preview.source.executablePath ?? preview.source.hwnd ?? preview.source.fingerprint;
  }
  return "No source metadata";
}

function describePreviewDeliveryMode(preview: DeliveryPreview): {
  title: string;
  detail: string;
  warning?: string;
  nextSteps: string[];
} {
  const openMode = preview.handoffCard.codexDeliveryMode ?? "newThread";
  const integrationMode = preview.handoffCard.codexIntegrationMode ?? "deepLink";
  const threadId = preview.handoffCard.codexThreadId;

  if (openMode === "existingThread" && integrationMode === "appServer") {
    return {
      title: "Existing Codex thread, sent via App Server",
      detail: threadId ? `Thread ${shortId(threadId)}` : "Selected existing thread",
      nextSteps: ["AgentBridge resumes the selected Codex thread.", "AgentBridge starts a new turn with this generated prompt."]
    };
  }

  if (openMode === "existingThread") {
    return {
      title: "Existing Codex thread, opened only",
      detail: threadId ? `Thread ${shortId(threadId)}` : "Selected existing thread",
      warning: "AgentBridge can open this existing Codex thread, but will not inject the prompt unless Codex App Server is connected.",
      nextSteps: ["AgentBridge opens the existing Codex thread.", "The generated prompt remains staged in AgentBridge for review/copy."]
    };
  }

  return {
    title: "New Codex thread",
    detail: "codex://threads/new with prompt and repo path",
    nextSteps: ["Codex opens a new thread with this prompt and repo path."]
  };
}

function deliveryResultMode(result: CodexDeliveryResult): string {
  if (result.deliveryMode === "appServerTurnStart") {
    return "Sent into existing Codex thread via App Server";
  }
  if (result.deliveryMode === "existingDeepLinkOpen") {
    return "Opened existing Codex thread only";
  }
  if (result.deliveryMode === "newDeepLink") {
    return result.openedAt ? "Opened new Codex thread" : "Generated new-thread deep link";
  }
  return result.openedAt ? "Opened Codex" : "Dry run generated";
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
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
