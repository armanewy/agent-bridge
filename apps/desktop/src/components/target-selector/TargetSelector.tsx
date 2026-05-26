import { Monitor } from "lucide-react";
import type { TargetEndpoint } from "@agentbridge/core";

interface TargetSelectorProps {
  targets: TargetEndpoint[];
  selectedTargetId?: string | undefined;
  onSelectTarget(id: string): void;
}

export function TargetSelector({ targets, selectedTargetId, onSelectTarget }: TargetSelectorProps): JSX.Element {
  const orderedTargets = [...targets].sort((a, b) => Number(b.kind === "codexDeepLink") - Number(a.kind === "codexDeepLink"));

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Target Selector</h2>
          <p>{targets.length} saved target(s)</p>
        </div>
        <Monitor size={20} />
      </div>
      <div className="selection-list">
        {orderedTargets.length === 0 ? (
          <p className="empty-copy">No targets yet. Configure a Codex repo target before creating a Mission.</p>
        ) : (
          orderedTargets.map((target) => {
            const summary = describeTarget(target);
            return (
              <button
                type="button"
                className={target.id === selectedTargetId ? "selection-row selected" : "selection-row"}
                key={target.id}
                onClick={() => onSelectTarget(target.id)}
              >
                <strong>{summary.title}</strong>
                <span>{summary.subtitle}</span>
                <small>{target.kind}</small>
                <p>{summary.detail}</p>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function describeTarget(target: TargetEndpoint): { title: string; subtitle: string; detail: string } {
  if (target.kind === "codexDeepLink") {
    return {
      title: "Codex deep link",
      subtitle: target.repoPath,
      detail: "Repo-aware TaskSpec delivery through codex://."
    };
  }
  if (target.kind === "windowsDesktopWindow") {
    return {
      title: target.title,
      subtitle: target.hwnd,
      detail: target.executablePath ?? "Windows desktop target"
    };
  }
  return {
    title: "Clipboard fallback",
    subtitle: target.parentTargetId,
    detail: "Requires explicit approval before use."
  };
}
