import { PlayCircle } from "lucide-react";
import type { VerificationCommand } from "@agentbridge/core";
import type { MissionDetail } from "../../services/bridge-contract.js";

interface VerificationPanelProps {
  detail: MissionDetail;
  onRunVerification(missionId: string): void;
}

export function VerificationPanel({ detail, onRunVerification }: VerificationPanelProps): JSX.Element {
  const commands = commandsForMission(detail);
  const latestResult = detail.verificationResults[0];
  const repoContext = detail.mission.repoContext;

  return (
    <section className="verification-panel">
      <div className="panel-heading compact">
        <div>
          <span className="eyebrow">Verification</span>
          <h3>{latestResult?.status ?? "not_run"}</h3>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={!repoContext?.repoPath}
          onClick={() => onRunVerification(detail.mission.id)}
        >
          <PlayCircle size={16} />
          Run verification
        </button>
      </div>

      {repoContext?.repoPath ? (
        <>
          <div className="verification-warning">
            Commands execute locally in the configured repository after this button click.
          </div>
          <div className="verification-meta">
            <span>{repoContext.repoPath}</span>
            <span>{repoContext.currentBranch ?? "unknown branch"}</span>
          </div>
          {commands.length > 0 ? (
            <ul className="command-list">
              {commands.map((command) => (
                <li key={`${command.kind}:${command.command}`}>
                  <strong>{command.kind}</strong>
                  <code>{command.command}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">No commands configured. Verification will capture git diff and require review.</p>
          )}
          {latestResult ? <p className="verification-summary">{latestResult.summary}</p> : null}
        </>
      ) : (
        <p className="empty-copy">Attach repo context through a Codex target before running verification.</p>
      )}
    </section>
  );
}

function commandsForMission(detail: MissionDetail): VerificationCommand[] {
  const repoPath = detail.mission.repoContext?.repoPath;
  const fromPlan = detail.mission.verificationPlan?.commands ?? [];
  const fromRepoContext: VerificationCommand[] = repoPath
    ? [
        ...(detail.mission.repoContext?.testCommand ? [{ kind: "test" as const, command: detail.mission.repoContext.testCommand, cwd: repoPath }] : []),
        ...(detail.mission.repoContext?.lintCommand ? [{ kind: "lint" as const, command: detail.mission.repoContext.lintCommand, cwd: repoPath }] : []),
        ...(detail.mission.repoContext?.typecheckCommand
          ? [{ kind: "typecheck" as const, command: detail.mission.repoContext.typecheckCommand, cwd: repoPath }]
          : [])
      ]
    : [];
  const seen = new Set<string>();
  return [...fromPlan, ...fromRepoContext].filter((command) => {
    const key = `${command.kind}:${command.command}:${command.cwd ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
