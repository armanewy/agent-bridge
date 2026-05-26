import { FolderPlus } from "lucide-react";
import type { CodexDeepLinkTarget } from "@agentbridge/core";

interface CodexTargetPanelProps {
  repoPath: string;
  onRepoPathChange(value: string): void;
  onCreate(): void;
  latestTarget?: CodexDeepLinkTarget | undefined;
  error?: string | undefined;
}

export function CodexTargetPanel({
  repoPath,
  onRepoPathChange,
  onCreate,
  latestTarget,
  error
}: CodexTargetPanelProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Codex Target</h2>
          <p>Configure the documented deep-link path for a local repository.</p>
        </div>
        <button type="button" className="icon-button" onClick={onCreate} title="Add Codex target">
          <FolderPlus size={18} />
        </button>
      </div>
      <label className="field">
        <span>Repository path</span>
        <input
          value={repoPath}
          onChange={(event) => onRepoPathChange(event.target.value)}
          placeholder="C:\Users\name\Documents\project"
        />
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
      {latestTarget ? (
        <div className="target-summary">
          <span className="status-dot" />
          <div>
            <strong>{latestTarget.repoPath}</strong>
            <span>New Codex thread via codex:// deep link</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
