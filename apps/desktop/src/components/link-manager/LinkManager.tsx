import { Link2, Plus } from "lucide-react";
import type { Link, SourceEndpoint, TargetEndpoint, Transform } from "@agentbridge/core";

interface LinkManagerProps {
  sources: SourceEndpoint[];
  targets: TargetEndpoint[];
  links: Link[];
  recipe: Transform["recipe"];
  onRecipeChange(recipe: Transform["recipe"]): void;
  onCreateLink(): void;
}

export function LinkManager({
  sources,
  targets,
  links,
  recipe,
  onRecipeChange,
  onCreateLink
}: LinkManagerProps): JSX.Element {
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

      <div className="link-canvas">
        <div className="link-node">
          <span>Source</span>
          <strong>{sources[0]?.kind === "browserTab" ? sources[0].title : "No browser source"}</strong>
        </div>
        <Link2 size={20} />
        <div className="link-node">
          <span>Target</span>
          <strong>{formatTarget(targets[0])}</strong>
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
