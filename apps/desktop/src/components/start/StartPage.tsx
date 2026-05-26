import { Bot, Chrome, ClipboardList, FolderOpen, Link2, Monitor } from "lucide-react";
import type {
  Capture,
  CodexDeepLinkTarget,
  CodexThreadRef,
  LinkableComponent,
  Mission,
  TargetEndpoint,
  WorkflowLink
} from "@agentbridge/core";
import type { SetupStatus } from "../../services/bridge-contract.js";

interface StartPageProps {
  components: LinkableComponent[];
  workflowLinks: WorkflowLink[];
  captures: Capture[];
  targets: TargetEndpoint[];
  codexThreads: CodexThreadRef[];
  missions: Mission[];
  setupStatus?: SetupStatus | undefined;
  selectedSourceComponentId?: string | undefined;
  selectedWorkspaceComponentId?: string | undefined;
  selectedTargetComponentId?: string | undefined;
  selectedCodexThreadId?: string | undefined;
  manualCodexThreadId: string;
  chatGptSourceMode: "chrome" | "desktop";
  linkError?: string | undefined;
  targetError?: string | undefined;
  onSelectCodexThread(threadId?: string): void;
  onManualCodexThreadIdChange(value: string): void;
  onChatGptSourceModeChange(mode: "chrome" | "desktop"): void;
  onSaveManualCodexThread(): void;
  onChooseRepo(): void;
  onCreateWorkflowLink(): void;
  onCreateTaskFromWorkflowLink(id: string): void;
  onOpenTasks(): void;
  onOpenAdvanced(): void;
  onOpenSettings(): void;
  onProbeDesktopApps(): void;
  onConnectChrome(): void;
  onCheckChromeConnection(): void;
}

export function StartPage({
  components,
  workflowLinks,
  captures,
  targets,
  codexThreads,
  missions,
  setupStatus,
  selectedSourceComponentId,
  selectedWorkspaceComponentId,
  selectedTargetComponentId,
  selectedCodexThreadId,
  manualCodexThreadId,
  chatGptSourceMode,
  linkError,
  targetError,
  onSelectCodexThread,
  onManualCodexThreadIdChange,
  onChatGptSourceModeChange,
  onSaveManualCodexThread,
  onChooseRepo,
  onCreateWorkflowLink,
  onCreateTaskFromWorkflowLink,
  onOpenTasks,
  onOpenAdvanced,
  onOpenSettings,
  onProbeDesktopApps,
  onConnectChrome,
  onCheckChromeConnection
}: StartPageProps): JSX.Element {
  const activeLink = workflowLinks.find((link) => {
    const linkedSource = components.find((component) => component.id === link.sourceComponentId);
    return link.enabled && (!linkedSource || (!isDemoComponent(linkedSource) && sourceMatchesMode(linkedSource, chatGptSourceMode)));
  });
  const candidateSourceComponent = activeLink
    ? components.find((component) => component.id === activeLink.sourceComponentId)
    : components.find((component) => component.id === selectedSourceComponentId);
  const sourceComponent = candidateSourceComponent && !isDemoComponent(candidateSourceComponent) ? candidateSourceComponent : undefined;
  const matchingSourceComponent = sourceComponent && sourceMatchesMode(sourceComponent, chatGptSourceMode) ? sourceComponent : undefined;
  const workspaceComponent = activeLink?.workspaceComponentId
    ? components.find((component) => component.id === activeLink.workspaceComponentId)
    : components.find((component) => component.id === selectedWorkspaceComponentId);
  const targetComponent = activeLink
    ? components.find((component) => component.id === activeLink.targetComponentId)
    : components.find((component) => component.id === selectedTargetComponentId);
  const codexTarget = targets.find((target): target is CodexDeepLinkTarget => target.kind === "codexDeepLink");
  const selectedCodexThread = codexThreads.find((thread) => thread.threadId === selectedCodexThreadId);
  const realCaptures = captures.filter((capture) => capture.metadata["mode"] !== "mock");
  const latestCapture = matchingSourceComponent ? realCaptures.find((capture) => captureBelongsToComponent(capture, matchingSourceComponent)) : undefined;
  const latestTask = missions[0];
  const canCreateLink = Boolean(
    matchingSourceComponent?.roleCapabilities.canBeSource &&
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
            <p>Connect a ChatGPT conversation to a local repo, then send scoped Task Cards to Codex.</p>
          </div>
          <span className={activeLink ? "status-pill" : "status-pill muted"}>{activeLink ? "Linked" : "Setup needed"}</span>
        </div>

        <div className="start-step-list">
          <div className="segmented-control source-mode-control" aria-label="ChatGPT source type">
            <button type="button" className={chatGptSourceMode === "chrome" ? "selected" : ""} onClick={() => onChatGptSourceModeChange("chrome")}>
              Chrome ChatGPT
            </button>
            <button type="button" className={chatGptSourceMode === "desktop" ? "selected" : ""} onClick={() => onChatGptSourceModeChange("desktop")}>
              ChatGPT Desktop
            </button>
          </div>
          <StartStep
            icon={chatGptSourceMode === "desktop" ? <Monitor size={20} /> : <Chrome size={20} />}
            label="ChatGPT source"
            title={matchingSourceComponent?.label ?? missingSourceTitle(chatGptSourceMode)}
            detail={matchingSourceComponent ? sourceDetail(matchingSourceComponent) : missingSourceDetail(chatGptSourceMode, setupStatus)}
            status={matchingSourceComponent ? "ready" : "missing"}
            actionLabel={matchingSourceComponent ? (chatGptSourceMode === "desktop" ? "Probe again" : "Change tab") : missingSourceAction(chatGptSourceMode)}
            onAction={chatGptSourceMode === "desktop" ? onProbeDesktopApps : matchingSourceComponent ? onOpenAdvanced : onConnectChrome}
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

        {!matchingSourceComponent ? (
          <div className="warning-band">
            <span>{chatGptSourceMode === "desktop" ? "Open ChatGPT Desktop, then probe desktop apps. AgentBridge uses Windows UI Automation only when ChatGPT exposes a readable conversation candidate." : "Install/connect Chrome, open ChatGPT, then use the AgentBridge extension to sync this tab. Ctrl+Shift+Y captures selected text."}</span>
            <button type="button" className="secondary-button" onClick={chatGptSourceMode === "desktop" ? onProbeDesktopApps : onCheckChromeConnection}>
              {chatGptSourceMode === "desktop" ? "Probe desktop apps" : "Check connection"}
            </button>
          </div>
        ) : null}

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
            source={matchingSourceComponent}
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
  const sessionId = component.backingRef.sessionId;
  const hwnd = component.backingRef.hwnd;
  return (
    (typeof component.backingRef.tabId === "number" && source.tabId === component.backingRef.tabId) ||
    (typeof url === "string" && source.url === url) ||
    (typeof sessionId === "string" && source.sessionId === sessionId) ||
    (typeof hwnd === "string" && source.hwnd === hwnd)
  );
}

function sourceMatchesMode(component: LinkableComponent, mode: "chrome" | "desktop"): boolean {
  if (mode === "desktop") {
    return component.provider === "chatgptDesktop" || component.kind === "chatgptDesktop";
  }
  return component.provider === "chatgpt" && component.kind === "browserTab";
}

function sourceDetail(component: LinkableComponent): string {
  if (component.provider === "chatgptDesktop") {
    const confidence = typeof component.metadata["confidence"] === "string" ? component.metadata["confidence"] : "unknown";
    return `${component.subtitle} · UIA confidence ${confidence}`;
  }
  return component.subtitle;
}

function missingSourceTitle(mode: "chrome" | "desktop"): string {
  return mode === "desktop" ? "No ChatGPT Desktop conversation found" : "No ChatGPT tabs found";
}

function missingSourceDetail(mode: "chrome" | "desktop", status?: SetupStatus): string {
  if (mode === "desktop") {
    return "Probe ChatGPT Desktop to see whether the current conversation is exposed through Windows UI Automation.";
  }
  return chromeConnectDetail(status);
}

function missingSourceAction(mode: "chrome" | "desktop"): string {
  return mode === "desktop" ? "Probe ChatGPT Desktop" : "Connect Chrome";
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

function chromeConnectDetail(status?: SetupStatus): string {
  if (status?.extensionConnected) {
    return `Chrome connected. Last seen ${status.lastExtensionHeartbeatAt ?? "recently"}. Open ChatGPT and sync this tab from the extension.`;
  }
  if (status?.extensionIdKnown) {
    return "Chrome bridge is configured. Install/open the extension, then sync this ChatGPT tab.";
  }
  return "Connect Chrome to install the local bridge and use the AgentBridge extension.";
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
