# Worktree Isolation

Parallel autonomous missions should use branch or git worktree isolation. No-isolation mode is unsafe for parallel loops and should be manual/supervised only. AgentBridge must never delete worktrees without explicit confirmation.
