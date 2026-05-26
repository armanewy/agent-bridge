# Completion Contracts

AgentBridge must not mark a mission autonomously passed unless every required acceptance criterion has objective evidence.

Supported verifier kinds:

- textual
- visual
- command
- gitDiff
- humanReview

Human-review-only criteria can make a contract valid for supervised work, but they cannot produce an autonomous pass. Missing objective visual/textual evidence should result in `needs_review`, not `passed`.
