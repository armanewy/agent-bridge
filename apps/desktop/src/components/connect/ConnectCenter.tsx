import { Cable, Chrome, Monitor, Network, PackageCheck, RefreshCw, Workflow } from "lucide-react";
import type { Capture, ComponentProvider, LinkableComponent, SourceEndpoint, WorkflowLink } from "@agentbridge/core";
import { CaptureInbox } from "../capture/CaptureInbox.js";

interface ConnectCenterProps {
  components: LinkableComponent[];
  workflowLinks: WorkflowLink[];
  captures: Capture[];
  sources: SourceEndpoint[];
  selectedSourceComponentId?: string | undefined;
  selectedWorkspaceComponentId?: string | undefined;
  selectedTargetComponentId?: string | undefined;
  selectedCaptureId?: string | undefined;
  linkError?: string | undefined;
  discoveryWarnings: string[];
  onSelectSource(id: string): void;
  onSelectWorkspace(id: string): void;
  onSelectTarget(id: string): void;
  onSelectCapture(id: string): void;
  onDiscover(): void;
  onCreateDemoCapture(): void;
  onCreateWorkflowLink(): void;
  onCreateTaskFromWorkflowLink(id: string): void;
}

function componentStatusLabel(component: LinkableComponent): string {
  if (component.riskLevel === "high") {
    return "High risk";
  }
  if (component.status === "permission_needed") {
    return "Needs permission";
  }
  if (component.status === "unsupported") {
    return "Unsupported";
  }
  if (component.roleCapabilities.canCapture) {
    return "Capture ready";
  }
  if (component.roleCapabilities.canDeliver) {
    return "Send ready";
  }
  if (component.roleCapabilities.canVerify) {
    return "Verify ready";
  }
  return "Detected";
}

function providerLabel(provider: ComponentProvider): string {
  return {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    github: "GitHub",
    codex: "Codex",
    vscode: "VS Code",
    cursor: "Cursor",
    terminal: "Terminal",
    repo: "Repo",
    browser: "Browser tab",
    unknown: "Unknown"
  }[provider];
}

export function ConnectCenter({
  components,
  workflowLinks,
  captures,
  sources,
  selectedSourceComponentId,
  selectedWorkspaceComponentId,
  selectedTargetComponentId,
  selectedCaptureId,
  linkError,
  discoveryWarnings,
  onSelectSource,
  onSelectWorkspace,
  onSelectTarget,
  onSelectCapture,
  onDiscover,
  onCreateDemoCapture,
  onCreateWorkflowLink,
  onCreateTaskFromWorkflowLink
}: ConnectCenterProps): JSX.Element {
  const browserTabs = components.filter((component) => component.kind === "browserTab");
  const workspaces = components.filter((component) => component.roleCapabilities.canBeWorkspace);
  const targets = components.filter((component) => component.roleCapabilities.canBeTarget);
  const selectedSource = components.find((component) => component.id === selectedSourceComponentId);
  const selectedWorkspace = components.find((component) => component.id === selectedWorkspaceComponentId);
  const selectedTarget = components.find((component) => component.id === selectedTargetComponentId);
  const needsWorkspace = selectedTarget?.provider === "codex";
  const canCreateLink = Boolean(selectedSource && selectedTarget && (!needsWorkspace || selectedWorkspace));

  return (
    <div className="connect-layout">
      <section className="panel connect-hero">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Connect</span>
            <h2>Connect your AI workflow.</h2>
            <p>Select a source, a repo workspace, and an agent target. AgentBridge turns that route into reusable Task Cards.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onDiscover}>
            <RefreshCw size={16} />
            Detect tabs and windows
          </button>
        </div>
        <div className="route-preview" aria-label="Selected workflow route">
          <RouteNode icon={<Chrome size={18} />} label="Source" value={selectedSource?.label ?? "Choose a browser tab"} />
          <span className="route-arrow">→</span>
          <RouteNode icon={<PackageCheck size={18} />} label="Workspace" value={selectedWorkspace?.label ?? "Choose a repo"} />
          <span className="route-arrow">→</span>
          <RouteNode icon={<Monitor size={18} />} label="Target" value={selectedTarget?.label ?? "Choose an agent"} />
        </div>
        {discoveryWarnings.length > 0 ? (
          <div className="warning-band">
            <span>{discoveryWarnings[0]}</span>
          </div>
        ) : null}
        {linkError ? (
          <div className="warning-band">
            <span>{linkError}</span>
          </div>
        ) : null}
        <div className="button-row">
          <button type="button" className="primary-button" disabled={!canCreateLink} onClick={onCreateWorkflowLink}>
            <Cable size={16} />
            Create Link
          </button>
          <button type="button" className="secondary-button" onClick={onCreateDemoCapture}>
            <Chrome size={16} />
            Use demo capture
          </button>
        </div>
      </section>

      <div className="component-columns">
        <ComponentSection
          title="Browser Tabs"
          empty="Use the Chrome extension to discover tabs or capture selected text."
          components={browserTabs}
          selectedId={selectedSourceComponentId}
          actionLabel="Use as source"
          onSelect={onSelectSource}
        />
        <ComponentSection
          title="Repos / Workspaces"
          empty="Choose a Codex repo target in Settings to add a workspace."
          components={workspaces}
          selectedId={selectedWorkspaceComponentId}
          actionLabel="Use as workspace"
          onSelect={onSelectWorkspace}
        />
        <ComponentSection
          title="Desktop Windows / Agents"
          empty="Run detection to list local windows, or configure Codex in Settings."
          components={targets}
          selectedId={selectedTargetComponentId}
          actionLabel="Use as target"
          onSelect={onSelectTarget}
        />
      </div>

      <section className="panel workflow-link-panel">
        <div className="panel-heading">
          <div>
            <h2>Links</h2>
            <p>Reusable routes. Create Task Cards from a link after capturing browser text.</p>
          </div>
          <Workflow size={20} />
        </div>
        {workflowLinks.length === 0 ? (
          <div className="empty-state">
            <strong>No link created yet.</strong>
            <p className="empty-copy">Select a source, repo, and target above, then create your first reusable link.</p>
          </div>
        ) : (
          <div className="workflow-link-grid">
            {workflowLinks.map((link) => (
              <WorkflowLinkCard
                key={link.id}
                link={link}
                components={components}
                onCreateTask={() => onCreateTaskFromWorkflowLink(link.id)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedSource ? (
        <CaptureInbox
          captures={captures}
          sources={sources}
          selectedCaptureId={selectedCaptureId}
          onSelectCapture={onSelectCapture}
          onCreateDemoCapture={onCreateDemoCapture}
        />
      ) : null}
    </div>
  );
}

function ComponentSection({
  title,
  empty,
  components,
  selectedId,
  actionLabel,
  onSelect
}: {
  title: string;
  empty: string;
  components: LinkableComponent[];
  selectedId?: string | undefined;
  actionLabel: string;
  onSelect(id: string): void;
}): JSX.Element {
  return (
    <section className="panel component-section">
      <div className="panel-heading compact">
        <div>
          <h2>{title}</h2>
          <p>{components.length} detected</p>
        </div>
      </div>
      <div className="component-list">
        {components.length === 0 ? (
          <p className="empty-copy">{empty}</p>
        ) : (
          components.map((component) => (
            <button
              type="button"
              className={component.id === selectedId ? "component-card selected" : "component-card"}
              key={component.id}
              onClick={() => onSelect(component.id)}
            >
              <span className="component-title">{component.label}</span>
              <span className="component-subtitle">{component.subtitle}</span>
              <CapabilityBadges component={component} />
              <span className="component-action">{actionLabel}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function WorkflowLinkCard({
  link,
  components,
  onCreateTask
}: {
  link: WorkflowLink;
  components: LinkableComponent[];
  onCreateTask(): void;
}): JSX.Element {
  const source = components.find((component) => component.id === link.sourceComponentId);
  const workspace = link.workspaceComponentId ? components.find((component) => component.id === link.workspaceComponentId) : undefined;
  const target = components.find((component) => component.id === link.targetComponentId);

  return (
    <article className="workflow-link-card">
      <div>
        <span className="eyebrow">Workflow link</span>
        <h3>{link.name}</h3>
      </div>
      <div className="workflow-route">
        <strong>{source?.label ?? "Source missing"}</strong>
        <span>→</span>
        <strong>{workspace?.label ?? "No workspace"}</strong>
        <span>→</span>
        <strong>{target?.label ?? "Target missing"}</strong>
      </div>
      <div className="badge-row">
        <span className="badge">Recipe: {link.recipe}</span>
        <span className={link.enabled ? "badge good" : "badge muted"}>{link.enabled ? "Enabled" : "Disabled"}</span>
        {link.verificationCommandDefaults.length > 0 ? <span className="badge">Verify configured</span> : null}
      </div>
      <button type="button" className="primary-button" onClick={onCreateTask}>
        <Network size={16} />
        Create Task
      </button>
    </article>
  );
}

function RouteNode({ icon, label, value }: { icon: JSX.Element; label: string; value: string }): JSX.Element {
  return (
    <div className="route-node">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CapabilityBadges({ component }: { component: LinkableComponent }): JSX.Element {
  const badges = [
    component.roleCapabilities.canCapture ? "Capture" : undefined,
    component.roleCapabilities.canDeliver ? "Send" : undefined,
    component.roleCapabilities.canVerify ? "Verify" : undefined,
    component.roleCapabilities.canObserve ? "Observe" : undefined,
    component.provider === "codex" ? "Official route" : undefined,
    component.riskLevel === "high" ? "Risky" : undefined,
    component.status === "unsupported" ? "Unsupported" : undefined
  ].filter(Boolean) as string[];

  return (
    <span className="badge-row">
      <span className={component.riskLevel === "high" ? "badge danger" : "badge"}>{providerLabel(component.provider)}</span>
      <span className="badge">{componentStatusLabel(component)}</span>
      {badges.map((badge) => (
        <span className={badge === "Risky" || badge === "Unsupported" ? "badge danger" : "badge"} key={badge}>
          {badge}
        </span>
      ))}
    </span>
  );
}
