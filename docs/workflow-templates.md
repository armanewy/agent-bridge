# Workflow Templates

The default AgentBridge workflow is ChatGPT-style reasoning ↔ Codex coding.

It is implemented as a template:

- Planner/Reviewer: ChatGPT manual handoff
- Executor: Codex
- Verifier: local verification

Agents do not freely message each other. AgentBridge enforces typed transitions: intent -> imported plan -> TaskSpec -> executor input -> verification package -> user review -> follow-up TaskSpec.
