# AgentBridge MVP Demo

## Fast Codex Demo

1. Run `pnpm install`.
2. Run `pnpm build`.
3. Run the desktop renderer with `pnpm dev:desktop`.
4. Open `http://127.0.0.1:5173`.
5. Bind the mock browser source.
6. Add a Codex target with the repository path.
7. Click `Preview Handoff`.
8. Review source, target, original capture, transformed prompt, and redaction findings.
9. Click `Dry Run Codex` to verify the generated deep link.
10. In Electron mode, click `Send to Codex` to open `codex://threads/new?prompt=...&path=...`.

## Extension-To-Desktop Capture Demo

1. Build the workspace with `pnpm build`.
2. Build the extension with `pnpm --filter @agentbridge/extension build`.
3. Update `apps/native-host/manifest/windows.com.agentbridge.native_host.json` with:
   - the built native host launcher path
   - the unpacked extension ID
4. Register the manifest:

   ```powershell
   powershell -ExecutionPolicy Bypass -File apps/native-host/scripts/install-native-host-windows.ps1 -ManifestPath C:\path\to\manifest.json
   ```

5. Load `apps/extension` as an unpacked Chrome extension.
6. Open a browser tab, select text, and click `Capture selected text`.
7. Run the desktop app and confirm the latest capture appears in the local source/capture flow.

All capture is explicit and user-triggered.
