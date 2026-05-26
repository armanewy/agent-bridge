# MVP Acceptance

## Pass Criteria

- Simple Mode's lowest-friction production path is the built-in Workbench: OpenAI Planner -> Codex Executor -> Verification -> Planner Review.
- Production Simple Mode uses the hosted AgentBridge Planner by default; no OpenAI API key is required for normal users.
- BYOK OpenAI planning remains Advanced only.
- User intent can start a mission before repo selection.
- Repo/workspace is inferred when possible and requested only when Codex new-thread creation, verification, or repo file operations require it.
- Repo files stay local unless explicit policy and user approval allow file upload.
- Browser extensions, ChatGPT Desktop probes, and external browser-tab imports are Advanced adapters, not default requirements.
- The desktop default navigation item is `Workbench`.
- The packaged desktop app opens at 760x940, has minimum size 680x760, and the Start screen has no horizontal scrolling at that size.
- Simple Mode shows repo, Planner, Codex, task state, verification, and review actions without exposing source/link/capture concepts.
- Workbench shows OpenAI Planner status and `needsAuth` when no API key is configured.
- Workbench shows Codex delivery status and whether existing-thread continuation is App Server capable or open-only fallback.
- User can choose a repo, ask Planner, generate TaskSpec, send to Codex, run verification, ask Planner to review, and send a follow-up.
- User can choose a repo, enter one intent, select Manual/Supervised/Autonomous, and start an Autopilot mission.
- User can also enter intent before choosing a repo while the mission is still in Bridge mode.
- Autopilot creates durable steps for planning, TaskSpec creation, Codex delivery, verification, Planner review, follow-up, steering, and approval requests.
- Autopilot stops when verification passes, max iterations are reached, the user stops it, a provider fails, or an approval/risk boundary is hit.
- Steering text is stored as a mission artifact and is sent to Codex through App Server `turn/steer` when an active App Server session is available.
- Codex provider events are stored locally for turn start, progress/tool events, turn completion/failure, errors, and steering when App Server event data is available.
- The Workbench shows the current timeline, pending approval cards, latest provider event, and a steering input without expanding raw provider details.
- Mission artifacts include planner responses, TaskSpec, Codex prompt, delivery result, verification logs, git diff, Planner review, follow-up prompt, and local artifact files where produced.
- Artifact file exchange is local-first: files are stored under the AgentBridge artifact root, staged separately for Codex, and never written into the repo or uploaded without policy support.
- Artifact file exchange is policy-gated: risky files pause Autopilot for approval before provider transfer, and artifact tray actions can stage/exclude files for Planner/Codex follow-up.
- Hosted planner payloads are minimized: intent, summaries, TaskSpec, verification summaries, and approved artifacts only.
- WorkflowLink, LinkableComponent, browser captures, ChatGPT Desktop, extension setup, and demo tools are hidden under Advanced.
- If Chrome is connected but no ChatGPT tab has been synced, only the Advanced legacy link center discusses syncing external ChatGPT tabs.
- The desktop app registers or repairs the native messaging host for the configured production extension ID.
- Extension heartbeat shows whether Chrome is connected and when it last contacted the desktop app.
- A Chrome extension can sync an existing ChatGPT tab as a source.
- A Chrome extension can explicitly capture selected text.
- Advanced legacy adapters can open ChatGPT in an AgentBridge-owned browser window and capture selected text from it after a user click.
- Advanced legacy adapters can open either a new ChatGPT session or a pasted existing ChatGPT conversation URL in the AgentBridge-owned window.
- The native host persists browser sources and captures locally.
- The desktop app lists real native-host captures by default; mock capture remains an explicit development action.
- The desktop app offers `Generate TaskSpec` after a Planner response exists.
- The desktop app can list source/capture state from the local store.
- A user can configure a Codex deep-link target by repository path.
- A deterministic transform creates a structured handoff.
- A deterministic transform creates a Mission, TaskSpec, HandoffCard, and generated prompt artifact.
- Repo context is attached when a Codex target has a configured repository path.
- The Workbench Task panel shows task title, goal, acceptance criteria, verification status, and next actions.
- The legacy Task Card Preview shows task title, goal, repo, target agent, acceptance criteria, verification commands, warnings, and expandable raw prompt/source details.
- The Task Card Preview shows whether delivery will create a new Codex thread, send into an existing thread via App Server, or only open an existing thread with the prompt staged.
- Dry-run Codex delivery generates the exact deep link without opening Codex.
- Approved Codex delivery opens `codex://threads/new?prompt=...&path=...` in Electron mode.
- Existing ChatGPT tabs/conversations are supported through extension tab binding/discovery and explicit selected-text/latest-message capture.
- ChatGPT Desktop is supported as a probed source candidate when Windows UI Automation exposes the current visible conversation, selected text, or visible message text.
- ChatGPT Desktop source support must show confidence and must not claim full desktop conversation/tab enumeration unless the UIA tree exposes it.
- A user can choose "New Codex thread" or save/select an existing Codex thread ID.
- Existing Codex threads can be opened with `codex://threads/<thread-id>`.
- Existing Codex thread continuation sends a prompt only when Codex App Server is available and `thread/resume` plus `turn/start` succeeds.
- Settings shows Codex App Server configured/connected status and whether existing Codex sessions are send-capable.
- Existing-thread deep-link fallback must warn that the prompt was staged but not injected.
- Delivery attempts and audit events are stored locally with Mission and HandoffCard provenance.
- Verification creates git diff/output artifacts and a VerificationResult.
- Failed verification creates an inspectable follow-up HandoffCard that can be dry-run or sent manually.
- Failed verification can trigger Planner review and follow-up generation through Autopilot when policy allows it.

## Fail Criteria

- Capture happens without a user gesture.
- Extension requests broad host permissions or registers all-page content scripts by default.
- Simple Mode recommends clipboard/manual/mock capture or requires a browser extension.
- ChatGPT Desktop support falls back to clipboard capture in Simple Mode.
- Delivery happens without an approval preview.
- Clipboard fallback runs without explicit approval.
- Suspected secrets are sent without warning.
- The app cannot clear local audit events.

## Known Limitations

- Hosted planner implementation is the production target; current BYOK planner still requires an OpenAI API key until cloud auth/provider code lands.
- Production builds need a stable Chrome extension ID and Web Store listing URL.
- Development builds can still use manual extension ID entry in Settings for optional unpacked-extension testing.
- The Tasks detail view shows source capture excerpt, TaskSpec, artifacts, delivery attempts, timeline, next action, and verification status.
- The desktop renderer uses mock data when running outside Electron.
- Generic Windows app delivery is available at the helper/service level but not yet a polished UI flow.
- Codex App Server transport is optional and must be configured in development with `CODEX_APP_SERVER_URL`.
- Existing-thread observation is lightweight and App Server-backed; deep-link-only Codex delivery remains open-only and cannot be observed.
- ChatGPT Desktop UIA quality depends on the app's accessibility tree. If only a generic WebView shell is exposed, desktop source support is detection-only.
