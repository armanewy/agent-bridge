# MVP Acceptance

## Pass Criteria

- Simple Mode's lowest-friction production path is the built-in Workbench: ChatGPT handoff -> Codex Executor -> Verification -> Review.
- User intent can start a mission before repo selection once a ChatGPT plan has been imported.
- Repo/workspace is inferred when possible and requested only when Codex new-thread creation, verification, or repo file operations require it.
- Existing Codex sessions with cwd/workspace metadata can provide workspace evidence; a user should not have to pick the same repo again.
- Planning and TaskSpec creation can proceed in Bridge mode without reading source files.
- Repo files stay local unless explicit policy and user approval allow file transfer.
- Browser extensions, ChatGPT Desktop probes, and external browser-tab imports are Advanced adapters, not default requirements.
- The desktop default navigation item is `Workbench`.
- The packaged desktop app opens at 760x940, has minimum size 680x760, and the Start screen has no horizontal scrolling at that size.
- Simple Mode shows repo, ChatGPT handoff, Codex, task state, verification, and review actions without exposing source/link/capture concepts.
- Workbench shows Codex delivery status and whether existing-thread continuation is App Server capable or open-only fallback.
- User can choose a repo, import a ChatGPT plan, generate TaskSpec, send to Codex, run verification, and send a follow-up.
- User can choose a repo, enter one intent, select Manual/Supervised/Autonomous, import a ChatGPT plan, and start an Autopilot mission.
- Autopilot creates durable steps for planning, TaskSpec creation, Codex delivery, verification, follow-up, steering, and approval requests.
- Autopilot stops when verification passes, max iterations are reached, the user stops it, a provider fails, or an approval/risk boundary is hit.
- Steering text is stored as a mission artifact and is sent to Codex through App Server `turn/steer` when an active App Server session is available.
- Codex provider events are stored locally for turn start, progress/tool events, turn completion/failure, errors, and steering when App Server event data is available.
- The Workbench shows the current timeline, pending approval cards, latest provider event, and a steering input without expanding raw provider details.
- Mission artifacts include imported ChatGPT plan, TaskSpec, Codex prompt, delivery result, verification logs, git diff, follow-up prompt, and local artifact files where produced.
- Artifact file exchange is local-first: files are stored under the AgentBridge artifact root, staged separately for Codex, and never written into the repo or uploaded without policy support.
- WorkflowLink, LinkableComponent, browser captures, ChatGPT Desktop, extension setup, and demo tools are hidden under Advanced.
- Verification creates git diff/output artifacts and a VerificationResult.
- Failed verification creates an inspectable follow-up HandoffCard that can be dry-run or sent manually.

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

- Workspace inference is evidence-based. Low-confidence hints never block Bridge mode and still require user confirmation before repo-bound work.
- Production builds need a stable Chrome extension ID and Web Store listing URL.
- Development builds can still use manual extension ID entry in Settings for optional unpacked-extension testing.
- Codex App Server transport is optional and must be configured in development with `CODEX_APP_SERVER_URL`.
- Existing-thread observation is lightweight and App Server-backed; deep-link-only Codex delivery remains open-only and cannot be observed.
- ChatGPT Desktop UIA quality depends on the app's accessibility tree. If only a generic WebView shell is exposed, desktop source support is detection-only.
