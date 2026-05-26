import { Bot, CheckCircle, Chrome, ClipboardList, FolderOpen, Link2, Settings } from "lucide-react";
import type {
  Capture,
  CodexDeepLinkTarget,
  CodexThreadRef,
  LinkableComponent,
  Mission,
  TargetEndpoint,
  WorkflowLink
} from "@agentbridge/core";

interface StartPageProps {
  components: LinkableComponent[];
  workflowLinks: WorkflowLink[];
  captures: Capture[];
  targets: TargetEndpoint[];
  codexThreads: CodexThreadRef[];
  missions: Mission[];
  selectedSourceComponentId?: string | undefined;
  selectedWorkspaceComponentId?: string | undefined;
  selectedTargetComponentId?: string | undefined;
  selectedCodexThreadId?: string | undefined;
  manualCodexThreadId: string;
  linkError?: string | undefined;
  targetError?: string | undefined;
  onSelectCodexThread(threadId?: string): void;
  onManualCodexThreadIdChange(value: string): void;
  onSaveManualCodexThread(): void;
  onUseCurrentTab(): void;
  onChooseRepo(): void;
  onCreateWorkflowLink(): void;
  onCreateTaskFromWorkflowLink(id: string): void;
  onOpenTasks(): void;
  onOpenAdvanced(): void;
  onOpenSettings(): void;
}

export function StartPage({
  components,
  workflowLinks,
  captures,
  targets,
  codexThreads,
  missions,
  selectedSourceComponentId,
  selectedWorkspaceComponentId,
  selectedTargetComponentId,
  selectedCodexThreadId,
  manualCodexThreadId,
  linkError,
  targetError,
  onSelectCodexThread,
  onManualCodexThreadIdChange,
  onSaveManualCodexThread,
  onUseCurrentTab,
  onChooseRepo,
  onCreateWorkflowLink,
  onCreateTaskFromWorkflowLink,
  onOpenTasks,
  onOpenAdvanced,
  onOpenSettings
}: StartPageProps): JSX.Element {
  const activeLink = workflowLinks.find((link) => {
    const linkedSource = components.find((component) => component.id === link.sourceComponentId);
    return link.enabled && (!linkedSource || !isDemoComponent(linkedSource));
  });
  const candidateSourceComponent = activeLink
    ? components.find((component) => component.id === activeLink.sourceComponentId)
    : components.find((component) => component.id === selectedSourceComponentId);
  const sourceComponent = candidateSourceComponent && !isDemoComponent(candidateSourceComponent) ? candidateSourceComponent : undefined;
  const workspaceComponent = activeLink?.workspaceComponentId
    ? components.find((component) => component.id === activeLink.workspaceComponentId)
    : components.find((component) => component.id === selectedWorkspaceComponentId);
  const targetComponent = activeLink
    ? components.find((component) => component.id === activeLink.targetComponentId)
    : components.find((component) => component.id === selectedTargetComponentId);
  const codexTarget = targets.find((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink");
  const selectedCodexThread = codexThreads.find((thread) => thread.threadId === selectedCodexThreadId);
  const realCaptures = captures.filter((capture) => capture.metadata["mode"] !== "mock");
  const latestCapture = sourceComponent ? realCaptures.find((capture) => captureBelongsToComponent(capture, sourceComponent)) : undefined;
  const latestTask = missions[0];
  const canCreateLink = Boolean(
    sourceComponent?.roleCapabilities.canBeSource &&
    (workspaceComponent?.roleCapabilities.canBeWorkspace || codexTarget) &&
    (targetComponent?.roleCapabilities.canBeTarget || codexTarget)
  );
  const canCreateTask = Boolean(activeLink && latestCapture);

  return (
    <div className="start-layout">
      <section className="panel start-flow-card">
        <div className="start-flow-heading">
          <div>
            <span className="eyebrow">Start</span>
            <h2>ChatGPT → Codex</h2>
            <p>Connect this browser conversation to a local repo, then send scoped Task Cards to Codex.</p>
          </div>
          <span className={activeLink ? "status-pill" : "status-pill muted"}>{activeLink ? "Linked" : "Setup needed"}</span>
        </div>

        <div className="start-step-list">
          <StartStep
            icon={<Chrome size={20} />}
            label="Browser tab"
            title={sourceComponent?.label ?? "Connect a ChatGPT tab"}
            detail={sourceComponent ? sourceComponent.subtitle : "In ChatGPT, select text and press Ctrl+Shift+Y."}
            status={sourceComponent ? "ready" : "missing"}
            actionLabel={sourceComponent ? "Change tab" : "Use current ChatGPT tab"}
            onAction={sourceComponent ? onOpenAdvanced : onUseCurrentTab}
          />
          <StartStep
            icon={<FolderOpen size={20} />}
            label="Repo"
            title={workspaceComponent?.label ?? repoLabel(codexTarget) ?? "Choose repo"}
            detail={repoDetail(workspaceComponent, codexTarget)}
            status={workspaceComponent || codexTarget ? "ready" : "missing"}
            actionLabel={workspaceComponent || codexTarget ? "Change repo" : "Choose repo"}
            onAction={onChooseRepo}
          />
          <StartStep
            icon={<Bot size={20} />}
            label="Codex"
            title={codexTarget ? (selectedCodexThread ? "Existing session selected" : "New thread selected") : "Ready after repo selection"}
            detail={codexTarget ? codexSessionDetail(selectedCodexThread) : "Choose a repo to create the Codex target."}
            status={codexTarget ? "ready" : "missing"}
            actionLabel={codexTarget ? "Check Codex" : "Choose repo"}
            onAction={codexTarget ? onOpenSettings : onChooseRepo}
          />
        </div>

        {codexTarget ? (
          <CodexSessionChooser
            threads={codexThreads}
            selectedThreadId={selectedCodexThreadId}
            manualThreadId={manualCodexThreadId}
            onSelectThread={onSelectCodexThread}
            onManualThreadIdChange={onManualCodexThreadIdChange}
            onSaveManualThread={onSaveManualCodexThread}
          />
        ) : null}

        {activeLink ? (
          <ActiveLinkSummary
            link={activeLink}
            source={sourceComponent}
            workspace={workspaceComponent}
            target={targetComponent}
            latestCapture={latestCapture}
            canCreateTask={canCreateTask}
            onCreateTask={() => onCreateTaskFromWorkflowLink(activeLink.id)}
            onOpenTasks={onOpenTasks}
            onOpenAdvanced={onOpenAdvanced}
          />
        ) : (
          <div className="start-action-row">
            <button type="button" className="primary-button" disabled={!canCreateLink} onClick={onCreateWorkflowLink}>
              <Link2 size={16} />
              Create Link
            </button>
            <button type="button" className="secondary-button" onClick={onOpenAdvanced}>
              Advanced options
            </button>
          </div>
        )}

        {linkError ? <p className="inline-error">{linkError}</p> : null}
        {targetError ? <p className="inline-error">{targetError}</p> : null}
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Latest Task</h2>
            <p>{latestTask ? "Most recent Task Card" : "No task cards yet"}</p>
          </div>
          <ClipboardList size={20} />
        </div>
        {latestTask ? (
          <article className="list-card">
            <strong>{latestTask.title}</strong>
            <span>{latestTask.status}</span>
            <small>{latestTask.updatedAt}</small>
          </article>
        ) : (
          <p className="empty-copy">Create the ChatGPT → Codex link, capture text, then create your first Task Card.</p>
        )}
      </section>
    </div>
  );
}

function StartStep({
  icon,
  label,
  title,
  detail,
  status,
  actionLabel,
  onAction
}: {
  icon: JSX.Element;
  label: string;
  title: string;
  detail: string;
  status: "ready" | "missing";
  actionLabel: string;
  onAction(): void;
}): JSX.Element {
  return (
    <article className={`start-step ${status}`}>
      <div className="start-step-icon">{icon}</div>
      <div>
        <span className="eyebrow">{label}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <button type="button" className="secondary-button" onClick={onAction}>
        {actionLabel}
      </button>
    </article>
  );
}

function ActiveLinkSummary({
  link,
  source,
  workspace,
  target,
  latestCapture,
  canCreateTask,
  onCreateTask,
  onOpenTasks,
  onOpenAdvanced
}: {
  link: WorkflowLink;
  source?: LinkableComponent | undefined;
  workspace?: LinkableComponent | undefined;
  target?: LinkableComponent | undefined;
  latestCapture?: Capture | undefined;
  canCreateTask: boolean;
  onCreateTask(): void;
  onOpenTasks(): void;
  onOpenAdvanced(): void;
}): JSX.Element {
  return (
    <div className="active-link-card">
      <span className="eyebrow">Active link</span>
      <h3>{source?.label ?? "ChatGPT"} → {workspace?.label ?? "repo"} → {target?.label ?? "Codex"}</h3>
      <div className="active-link-grid">
        <Metric label="Recipe" value={link.recipe} />
        <Metric label="Codex session" value={link.codexThreadId ? shortThread(link.codexThreadId) : "New thread"} />
        <Metric label="Verification" value={link.verificationCommandDefaults.length ? "Configured" : "Not configured"} />
        <Metric label="Capture" value={latestCapture ? `${latestCapture.text.length} characters` : "Missing"} />
      </div>
      {latestCapture ? (
        <div className="latest-capture-strip">
          <strong>Latest capture</strong>
          <p>{latestCapture.text.slice(0, 260)}</p>
        </div>
      ) : (
        <div className="warning-band">
          <span>Select text in ChatGPT and press Ctrl+Shift+Y, then create the Task Card.</span>
        </div>
      )}
      <div className="start-action-row">
        <button type="button" className="primary-button" disabled={!canCreateTask} onClick={onCreateTask}>
          <ClipboardList size={16} />
          Create Task Card
        </button>
        <button type="button" className="secondary-button" onClick={onOpenTasks}>
          Open Tasks
        </button>
        <button type="button" className="secondary-button" onClick={onOpenAdvanced}>
          Change link
        </button>
      </div>
    </div>
  );
}

function CodexSessionChooser({
  threads,
  selectedThreadId,
  manualThreadId,
  onSelectThread,
  onManualThreadIdChange,
  onSaveManualThread
}: {
  threads: CodexThreadRef[];
  selectedThreadId?: string | undefined;
  manualThreadId: string;
  onSelectThread(threadId?: string): void;
  onManualThreadIdChange(value: string): void;
  onSaveManualThread(): void;
}): JSX.Element {
  return (
    <section className="session-panel">
      <div className="panel-heading compact">
        <div>
          <h3>Codex session</h3>
          <p>Choose an existing Codex thread, or start a new one for this repo.</p>
        </div>
      </div>
      <div className="session-list">
        <button
          type="button"
          className={!selectedThreadId ? "list-card selectable selected" : "list-card selectable"}
          onClick={() => onSelectThread(undefined)}
        >
          <strong>Start new Codex thread</strong>
          <span>AgentBridge sends the prompt with codex://threads/new.</span>
        </button>
        {threads.map((thread) => (
          <button
            type="button"
            key={thread.threadId}
            className={selectedThreadId === thread.threadId ? "list-card selectable selected" : "list-card selectable"}
            onClick={() => onSelectThread(thread.threadId)}
          >
            <strong>{thread.name ?? `Codex thread ${shortThread(thread.threadId)}`}</strong>
            <span>
              {shortThread(thread.threadId)} · {thread.status ?? "unknown"} · {thread.source}
            </span>
            <small>
              {thread.source === "appServer"
                ? "AgentBridge can send into this existing Codex session."
                : "AgentBridge can open this existing session; sending into it requires Codex App Server."}
            </small>
          </button>
        ))}
      </div>
      <div className="inline-form">
        <input
          value={manualThreadId}
          onChange={(event) => onManualThreadIdChange(event.target.value)}
          placeholder="Paste Codex thread ID"
        />
        <button type="button" className="secondary-button" onClick={onSaveManualThread}>
          Save thread
        </button>
      </div>
      <p className="muted-help">In Codex, run /status to see the current thread ID.</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function captureBelongsToComponent(capture: Capture, component: LinkableComponent): boolean {
  if (component.backingRef.sourceId && capture.sourceId === component.backingRef.sourceId) {
    return true;
  }
  const source = capture.metadata["source"];
  if (!isRecord(source)) {
    return false;
  }
  const url = typeof component.metadata["url"] === "string" ? component.metadata["url"] : undefined;
  return (
    (typeof component.backingRef.tabId === "number" && source.tabId === component.backingRef.tabId) ||
    (typeof url === "string" && source.url === url)
  );
}

function repoLabel(target?: CodexDeepLinkTarget): string | undefined {
  if (!target) {
    return undefined;
  }
  return target.repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? target.repoPath;
}

function repoDetail(component?: LinkableComponent, target?: CodexDeepLinkTarget): string {
  if (component) {
    return component.subtitle;
  }
  if (target) {
    return target.repoPath;
  }
  return "Pick the local repository Codex should work in.";
}

function codexSessionDetail(thread?: CodexThreadRef): string {
  if (!thread) {
    return "New thread for this repo. Existing sessions can be selected below.";
  }
  if (thread.source === "appServer") {
    return `Will send into existing session ${shortThread(thread.threadId)} through Codex App Server.`;
  }
  return `Will open existing session ${shortThread(thread.threadId)}; prompt injection needs Codex App Server.`;
}

function shortThread(threadId: string): string {
  return threadId.length > 12 ? `${threadId.slice(0, 6)}…${threadId.slice(-4)}` : threadId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDemoComponent(component: LinkableComponent): boolean {
  return typeof component.backingRef.sourceId === "string" && component.backingRef.sourceId.includes("mock");
}
