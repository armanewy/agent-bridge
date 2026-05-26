# AgentBridge MVP Demo

## Fast Codex Demo

1. Run `pnpm install`.
2. Run `pnpm desktop:package`.
3. Launch `apps/desktop/release/win-unpacked/AgentBridge.exe`.
4. On Start, choose the local repo folder. This creates the Codex deep-link target.
5. In Chrome/ChatGPT, select text and press `Ctrl+Shift+Y`.
6. On Start, create the ChatGPT -> repo -> Codex link if it does not already exist.
7. Click `Create Task Card` and review the Task Card Preview.
8. Click `Dry run` to verify the generated deep link.
9. Click `Send to Codex` to open `codex://threads/new?prompt=...&path=...`.

## Extension-To-Desktop Capture Demo

1. Build the workspace with `pnpm build`.
2. Build the extension with `pnpm --filter @agentbridge/extension build`.
3. Load `apps/extension` as an unpacked Chrome extension.
4. Copy the unpacked extension ID into AgentBridge Settings and click `Connect Chrome extension`.
5. Open a browser tab, select text, and click `Capture selected text` or press `Ctrl+Shift+Y`.
6. Confirm Start shows the latest capture for the active link.

All capture is explicit and user-triggered.
