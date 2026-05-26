import { FolderPlus } from "lucide-react";
import type { CodexDeepLinkTarget } from "@agentbridge/core";

interface CodexTargetPanelProps {
  repoPath: string;
  onRepoPathChange(value: string): void;
  testCommand: string;
  lintCommand: string;
  typecheckCommand: string;
  onTestCommandChange(value: string): void;
  onLintCommandChange(value: string): void;
  onTypecheckCommandChange(value: string): void;
  onCreate(): void;
  latestTarget?: CodexDeepLinkTarget | undefined;
  error?: string | undefined;
}

export function CodexTargetPanel({
  repoPath,
  onRepoPathChange,
  testCommand,
  lintCommand,
  typecheckCommand,
  onTestCommandChange,
  onLintCommandChange,
  onTypecheckCommandChange,
  onCreate,
  latestTarget,
  error
}: CodexTargetPanelProps): JSX.Element {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Repo and Codex</h2>
          <p>Choose the local repo Codex should work in and optional verification commands.</p>
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
      <div className="command-grid">
        <label className="field">
          <span>Test command</span>
          <input value={testCommand} onChange={(event) => onTestCommandChange(event.target.value)} placeholder="pnpm test" />
        </label>
        <label className="field">
          <span>Lint command</span>
          <input value={lintCommand} onChange={(event) => onLintCommandChange(event.target.value)} placeholder="pnpm lint" />
        </label>
        <label className="field">
          <span>Typecheck command</span>
          <input
            value={typecheckCommand}
            onChange={(event) => onTypecheckCommandChange(event.target.value)}
            placeholder="pnpm build"
          />
        </label>
      </div>
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
