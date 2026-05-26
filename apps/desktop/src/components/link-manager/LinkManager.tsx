import { Link2, Plus } from "lucide-react";
import type { Link, SourceEndpoint, TargetEndpoint, Transform } from "@agentbridge/core";

interface LinkManagerProps {
  sources: SourceEndpoint[];
  targets: TargetEndpoint[];
  links: Link[];
  recipe: Transform["recipe"];
  selectedSourceId?: string | undefined;
  selectedTargetId?: string | undefined;
  onRecipeChange(recipe: Transform["recipe"]): void;
  onSourceChange(id: string): void;
  onTargetChange(id: string): void;
  onCreateLink(): void;
}

export function LinkManager({
  sources,
  targets,
  links,
  recipe,
  selectedSourceId,
  selectedTargetId,
  onRecipeChange,
  onSourceChange,
  onTargetChange,
  onCreateLink
}: LinkManagerProps): JSX.Element {
  const selectedSource = sources.find((source) => source.id === selectedSourceId);
  const selectedTarget = targets.find((target) => target.id === selectedTargetId);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Links</h2>
          <p>Bind a browser source to a target and choose the transform recipe.</p>
        </div>
        <button type="button" className="icon-button" onClick={onCreateLink} title="Create link">
          <Plus size={18} />
        </button>
      </div>

      <div className="segmented-control" aria-label="Transform recipe">
        {(["implementationBrief", "codeReviewRequest", "debuggingRequest", "rawRelay"] as Transform["recipe"][]).map((item) => (
          <button
            key={item}
            type="button"
            className={recipe === item ? "selected" : ""}
            onClick={() => onRecipeChange(item)}
          >
            {labelForRecipe(item)}
          </button>
        ))}
      </div>

      <div className="link-picker-grid">
        <label className="field-label" htmlFor="legacy-source">
          Source
          <select
            id="legacy-source"
            value={selectedSourceId ?? ""}
            onChange={(event) => onSourceChange(event.currentTarget.value)}
          >
            <option value="" disabled>
              Select a source
            </option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.kind === "browserTab" ? source.title : source.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label" htmlFor="legacy-target">
          Target
          <select
            id="legacy-target"
            value={selectedTargetId ?? ""}
            onChange={(event) => onTargetChange(event.currentTarget.value)}
          >
            <option value="" disabled>
              Select a target
            </option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {formatTarget(target)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="link-canvas">
        <div className="link-node">
          <span>Source</span>
          <strong>{selectedSource?.kind === "browserTab" ? selectedSource.title : "No browser source"}</strong>
        </div>
        <Link2 size={20} />
        <div className="link-node">
          <span>Target</span>
          <strong>{formatTarget(selectedTarget)}</strong>
        </div>
      </div>

      <div className="item-list">
        {links.length === 0 ? (
          <p className="empty-copy">No saved links yet.</p>
        ) : (
          links.map((link) => (
            <article className="list-card" key={link.id}>
              <strong>{link.name}</strong>
              <span>{link.transformId} to {link.deliveryMode}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function labelForRecipe(recipe: Transform["recipe"]): string {
  const labels: Record<Transform["recipe"], string> = {
    rawRelay: "Raw",
    implementationBrief: "Brief",
    codeReviewRequest: "Review",
    debuggingRequest: "Debug"
  };
  return labels[recipe];
}

function formatTarget(target?: TargetEndpoint): string {
  if (!target) {
    return "No target";
  }
  if (target.kind === "codexDeepLink") {
    return "Codex";
  }
  if (target.kind === "windowsDesktopWindow") {
    return target.title;
  }
  return "Clipboard fallback";
}
