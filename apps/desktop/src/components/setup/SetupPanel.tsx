import { CheckCircle, Circle, Settings } from "lucide-react";
import type { SetupStatus } from "../../services/bridge-contract.js";

interface SetupPanelProps {
  status?: SetupStatus | undefined;
  extensionId: string;
  setupError?: string | undefined;
  onExtensionIdChange(value: string): void;
  onConfigureNativeHost(): void;
  onConnectChrome(): void;
  onOpenChromeExtensionInstall(): void;
  onRefresh(): void;
  onGoToConnect(): void;
}

export function SetupPanel({
  status,
  extensionId,
  setupError,
  onExtensionIdChange,
  onConfigureNativeHost,
  onConnectChrome,
  onOpenChromeExtensionInstall,
  onRefresh,
  onGoToConnect
}: SetupPanelProps): JSX.Element {
  const steps = setupSteps(status);
  const isReady = steps.every((step) => step.status === "ready" || step.optional);

  return (
    <div className="setup-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Connect AgentBridge</h2>
            <p>Choose a repo, connect Chrome, and send a dry-run task before daily use.</p>
          </div>
          <Settings size={20} />
        </div>

        {status?.mode === "development" ? (
          <div className="dev-mode-banner">
            Development mode: using Vite at {status.devServerUrl ?? "127.0.0.1"}.
          </div>
        ) : null}

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

        <div className="setup-actions">
          <button type="button" className="primary-button" onClick={onConfigureNativeHost}>
            Connect Chrome
          </button>
          <button type="button" className="secondary-button" onClick={onConnectChrome}>
            Install or repair Chrome connection
          </button>
          <button type="button" className="secondary-button" disabled={!status?.webStoreUrl} onClick={onOpenChromeExtensionInstall}>
            Open Chrome Web Store
          </button>
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Refresh status
          </button>
          {isReady ? (
            <button type="button" className="secondary-button" onClick={onGoToConnect}>
              Go to Connect
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
          {status?.extensionIdentityMode === "developmentManual" ? (
            <div className="diagnostic-form">
              <label className="field-label" htmlFor="extension-id">
                Development extension ID
              </label>
              <input
                id="extension-id"
                value={extensionId}
                onChange={(event) => onExtensionIdChange(event.currentTarget.value)}
                placeholder={status?.extensionId ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
              />
              <p className="muted-help">Manual IDs are only for unpacked development extensions.</p>
            </div>
          ) : null}
          <div className="setup-checks">
            {(status?.checks ?? []).map((check) => (
              <article className={`setup-check ${check.status}`} key={check.id}>
                <strong>{friendlyCheckLabel(check.id, check.label)}</strong>
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
      id: "repo",
      title: "Choose a repo",
      description: "Add the local repository Codex should work in using the repo panel beside this guide.",
      status: get("codexTarget")
    },
    {
      id: "extension",
      title: "Connect Chrome extension",
      description: "Install or load the AgentBridge Chrome extension, then connect it to this desktop app.",
      status: ["extensionId", "nativeHostManifest", "nativeHostPath", "allowedOrigin"].every((id) => get(id) === "ready")
        ? "ready"
        : "missing"
    },
    {
      id: "testCapture",
      title: "Capture a test selection",
      description: "Select text in Chrome, click AgentBridge capture or press Ctrl+Shift+Y, then confirm it appears in Connect under the selected source.",
      status: get("extensionHealth") === "ready" ? "ready" : "warning",
      optional: true
    },
    {
      id: "dryRun",
      title: "Send a dry-run task to Codex",
      description: "Create a Task Card and use Dry run to inspect the Codex deep link before opening Codex.",
      status: get("codexTarget") === "ready" ? "warning" : "missing",
      optional: true
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

function friendlyCheckLabel(id: string, fallback: string): string {
  const labels: Record<string, string> = {
    storeWritable: "Local storage ready",
    extensionId: "Chrome extension selected",
    nativeHostManifest: "Chrome connection installed",
    nativeHostPath: "Local bridge installed",
    allowedOrigin: "Chrome extension is authorized",
    extensionHealth: "Chrome health check",
    codexTarget: "Codex ready"
  };
  return labels[id] ?? fallback;
}
