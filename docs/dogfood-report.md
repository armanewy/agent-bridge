# Dogfood Report

## Current Workflow

- Desktop defaults to Workbench: choose repo -> ask OpenAI Planner -> generate TaskSpec -> send to Codex -> verify -> ask Planner to review.
- Codex delivery uses the Codex Executor provider, backed by the existing deep-link/App Server services.
- Verification captures git diff and command outputs, stores a VerificationResult, and can be sent back to Planner for review.
- Follow-up TaskSpecs can be drafted from Planner review and sent back to Codex.
- Legacy browser/ChatGPT capture and Workflow Links remain under Advanced.

## What Works

- The product now has a durable Task Card lifecycle instead of a transient copy/paste handoff.
- Provider profiles, sessions, turns, and events give the Workbench a real adapter/control-plane layer.
- The default flow no longer depends on Chrome extension setup or ChatGPT session scraping.
- TaskSpec compilation is the core value layer: goal, background, requirements, constraints, non-goals, acceptance criteria, and verification steps.
- Repo context is attached before Codex delivery.
- Artifact memory is inspectable in Task detail.
- The extension no longer registers broad all-page content scripts.
- The Workbench keeps the default route narrow; the Link Center remains in Advanced for diagnostics.

## What Still Feels Annoying

- Planner requires an OpenAI API key in the environment.
- Running the renderer in browser mode cannot open Codex deep links like Electron can.
- Codex delivery observation stops at "opened deep link."
- Browser-tab discovery is still opt-in in Advanced because all-tab metadata needs the optional Chrome `tabs` permission.

## What Is Unsafe Or Thin

- Generic Windows delivery still needs stronger visible target revalidation before it should be a daily-driver path.
- Verification commands are user-confirmed, but command configuration still deserves careful UX.
- ChatGPT latest-message capture remains selector-fragile and must stay in Advanced.
- Codex follow-up cards are prompt-dispatch objects, not observed agent sessions yet.

## Useful Tomorrow

- Dogfood the full path with a real OpenAI Planner prompt and a real Codex repo target.
- Use the focused Workbench for one full Planner -> Codex -> verification -> Planner review session.
- Add Codex SDK/app-server observation after the Task Card state proves stable.
- Add artifact filtering and better run grouping.

## Continue/Kill Criteria

- Continue if a developer uses at least five Task Cards per workday after setup.
- Continue if successful Planner-to-Codex Task Card creation stays under 10 seconds after the Planner answer.
- Continue if verification artifacts are actually used to decide follow-up prompts.
- Kill or pivot if users mostly treat it as a clipboard wrapper and ignore Task history.
- Kill or pivot if the Workbench is less useful than asking the Planner and Codex separately.
