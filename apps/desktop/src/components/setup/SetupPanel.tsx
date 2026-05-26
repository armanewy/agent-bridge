import { Settings } from "lucide-react";
import type { SetupStatus } from "../../services/bridge-contract.js";

interface SetupPanelProps {
  status?: SetupStatus | undefined;
  extensionId: string;
  setupError?: string | undefined;
  onExtensionIdChange(value: string): void;
  onConfigureNativeHost(): void;
  onRefresh(): void;
}

export function SetupPanel({
  status,
  extensionId,
  setupError,
  onExtensionIdChange,
  onConfigureNativeHost,
  onRefresh
}: SetupPanelProps): JSX.Element {
  return (
    <div className="setup-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>First-run setup</h2>
            <p>Register Chrome native messaging and confirm local readiness.</p>
          </div>
          <Settings size={20} />
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
            Generate and register native host
          </button>
          <button type="button" className="secondary-button" onClick={onRefresh}>
            Refresh status
          </button>
        </div>
        {setupError ? <p className="error-copy">{setupError}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Setup status</h2>
            <p>{status?.storePath ?? "Loading setup status."}</p>
          </div>
        </div>
        <div className="setup-checks">
          {(status?.checks ?? []).map((check) => (
            <article className={`setup-check ${check.status}`} key={check.id}>
              <strong>{check.label}</strong>
              <span>{check.status}</span>
              <small>{check.details}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
