# Dogfood Report

## Current Workflow

- Browser selected text can be captured explicitly through the Chrome extension and native host.
- Desktop defaults to Start: one ChatGPT/browser tab -> repo -> Codex route with one primary next action.
- A Workflow Link creates a Task Card from the latest matching capture for the linked source.
- Preview creates a TaskSpec, HandoffCard, prompt artifacts, and legacy Handoff.
- Codex delivery records mission/card-aware DeliveryAttempts and audit events.
- Verification is user-confirmed, captures git diff and command outputs, and stores a VerificationResult.
- Failed verification creates a visible follow-up HandoffCard that can be dry-run or sent manually.

## What Works

- The product now has a durable Task Card lifecycle instead of a transient copy/paste handoff.
- TaskSpec compilation is the core value layer: goal, background, requirements, constraints, non-goals, acceptance criteria, and verification steps.
- Repo context is attached before Codex delivery.
- Artifact memory is inspectable in Task detail.
- The extension no longer registers broad all-page content scripts.
- The Start page keeps the default route narrow; the Link Center remains in Advanced for diagnostics.

## What Still Feels Annoying

- Chrome developer-mode/native-host setup is still a multi-step process.
- Running the renderer in browser mode cannot open Codex deep links like Electron can.
- Codex delivery observation stops at "opened deep link."
- Browser-tab discovery is opt-in because all-tab metadata needs the optional Chrome `tabs` permission.

## What Is Unsafe Or Thin

- Generic Windows delivery still needs stronger visible target revalidation before it should be a daily-driver path.
- Verification commands are user-confirmed, but command configuration still deserves careful UX.
- ChatGPT latest-message capture remains selector-fragile and must stay secondary to selected text.
- Codex follow-up cards are prompt-dispatch objects, not observed agent sessions yet.

## Useful Tomorrow

- Dogfood the full path with a real ChatGPT answer and a real Codex repo target.
- Use the focused Start route for one full ChatGPT -> AgentBridge repo -> Codex work session.
- Add Codex SDK/app-server observation after the Task Card state proves stable.
- Add artifact filtering and better run grouping.

## Continue/Kill Criteria

- Continue if a developer uses at least five Task Cards per workday after setup.
- Continue if successful selected-text-to-Codex Task Card creation stays under 10 seconds after capture.
- Continue if verification artifacts are actually used to decide follow-up prompts.
- Kill or pivot if users mostly treat it as a clipboard wrapper and ignore Task history.
- Kill or pivot if native host setup remains the dominant support issue after setup UI improvements.
