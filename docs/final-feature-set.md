# Final Feature Set Addendum

This addendum tracks the Wave 27-33 foundations now present in the codebase.

## Supported

- Hosted AgentBridge Planner as the Simple Mode planner target.
- Codex Executor through App Server or deep-link fallback.
- Workflow templates for the default Planner/Reviewer -> Codex Executor -> local Verifier loop.
- Completion contracts: done means concrete criteria with required evidence.
- Autopilot decision logic for pass, retry, ask user, blocked, and repeated-loop stops.
- Verification artifacts, command results, git diff summaries, and planner review artifacts.
- Worktree/branch isolation model and WorktreeManagerService foundations.
- Mission queue and file conflict service foundations for parallel mission safety.
- Local-first artifact storage and policy-controlled provider payloads.
- Advanced Codex Local Planner mode through a separate Codex planning thread.
- Advanced imports for Chrome/ChatGPT Desktop experiments.

## Unsupported

- Real Claude/Cursor providers.
- Generic RPA.
- Consumer ChatGPT session scraping as the default path.
- Automatic full-repo upload.
- LLM-only completion pass.
- Silent worktree deletion or destructive cleanup.

## Dogfood Verdict

AgentBridge is still safest as a personal dogfood tool until the worktree/queue services are wired into the full UI and daily mission loop. The critical safety direction is in place: unverifiable missions become `needs_review` or blocked rather than falsely passed.
