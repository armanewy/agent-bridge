# Workflow Templates

The default AgentBridge workflow is ChatGPT-style reasoning ↔ Codex coding.

It is implemented as a template:

- Planner/Reviewer: AgentBridge Hosted Planner
- Executor: Codex
- Verifier: local verification

Agents do not freely message each other. AgentBridge enforces typed transitions: intent → plan → TaskSpec → executor input → verification package → planner review → follow-up TaskSpec.
