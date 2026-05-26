import { CheckCircle, Circle, Settings } from "lucide-react";
import type { SetupStatus } from "../../services/bridge-contract.js";

interface SetupPanelProps {
  status?: SetupStatus | undefined;
  extensionId: string;
  setupError?: string | undefined;
  onExtensionIdChange(value: string): void;
  onConfigureNativeHost(): void;
  onRefresh(): void;
  onGoToInbox(): void;
}

export function SetupPanel({
  status,
  extensionId,
  setupError,
  onExtensionIdChange,
  onConfigureNativeHost,
  onRefresh,
  onGoToInbox
}: SetupPanelProps): JSX.Element {
  const steps = setupSteps(status);
  const isReady = steps.every((step) => step.status === "ready" || step.optional);

  return (
    <div className="setup-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Connect AgentBridge</h2>
            <p>Connect capture, repo, and Codex once. Daily use starts from the Inbox.</p>
          </div>
          <Settings size={20} />
        </div>

        <div className="setup-step-list">
          {steps.map((step, index) => (
            <article className={`setup-step ${step.status}`} key={step.id}>
              {step.status === "ready" ? <CheckCircle size={18} /> : <Circle size={18} />}
              <div>
                <span className="eyebrow">Step {index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </article>
          ))}
        </div>

        <label className="field-label" htmlFor="extension-id">
          Chrome extension ID
        </label>
        <input
          id="extension-id"
          value={extensionId}
          onChange={(event) => onExtensionIdChange(event.currentTarget.value)}
          placeholder={status?.extensionId ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
        />
        <div className="setup-actions">
          <button type="button" className="primary-button" onClick={onConfigureNativeHost}>
            Connect Chrome extension
          </button>
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Refresh status
          </button>
          {isReady ? (
            <button type="button" className="secondary-button" onClick={onGoToInbox}>
              Go to Inbox
            </button>
          ) : null}
        </div>
        {setupError ? <p className="error-copy">{setupError}</p> : null}
        {isReady ? <p className="ok-copy">Ready to capture tasks.</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Details</h2>
            <p>{status?.storePath ?? "Loading setup status."}</p>
          </div>
        </div>
        <details className="advanced-details" open={false}>
          <summary>Show diagnostics</summary>
          <div className="setup-checks">
            {(status?.checks ?? []).map((check) => (
              <article className={`setup-check ${check.status}`} key={check.id}>
                <strong>{check.label}</strong>
                <span>{check.status}</span>
                <small>{check.details}</small>
              </article>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  status: "ready" | "warning" | "missing";
  optional?: boolean;
}

function setupSteps(status?: SetupStatus): SetupStep[] {
  const checks = new Map((status?.checks ?? []).map((check) => [check.id, check]));
  const get = (id: string) => checks.get(id)?.status ?? "missing";
  return [
    {
      id: "storeWritable",
      title: "Local storage ready",
      description: "Task Cards, artifacts, and verification results stay on this machine.",
      status: get("storeWritable")
    },
    {
      id: "extension",
      title: "Connect Chrome extension",
      description: "Paste the unpacked extension ID, then register the local bridge.",
      status: ["extensionId", "nativeHostManifest", "nativeHostPath", "allowedOrigin"].every((id) => get(id) === "ready")
        ? "ready"
        : "missing"
    },
    {
      id: "repo",
      title: "Choose repo",
      description: "Add your main local repository in the Codex panel beside this setup guide.",
      status: get("codexTarget")
    },
    {
      id: "agent",
      title: "Configure Codex target",
      description: "AgentBridge will open Codex with a repo-aware prompt through a deep link.",
      status: get("codexTarget")
    },
    {
      id: "verification",
      title: "Optional verification commands",
      description: "Add test, lint, or typecheck commands when you configure the repo.",
      status: "warning",
      optional: true
    }
  ];
}
