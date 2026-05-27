# Windows Setup

## Prerequisites

- Node.js 22 or newer.
- pnpm 9.15.4 or newer.
- .NET SDK 8.
- Chrome for the Manifest V3 extension.

## Install Dependencies

```powershell
pnpm install
```

## Build

```powershell
pnpm build
dotnet build apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj
```

## Run Desktop Renderer

```powershell
pnpm dev:desktop
```

This is for development only. The Vite URL is not the product surface.

## Run Desktop App

```powershell
pnpm desktop:dev
```

This opens the Electron app and uses the Vite renderer in development mode.

For the full local product loop, use:

```powershell
pnpm dev:local
```

This starts the minimal local AgentBridge Cloud auth scaffold on a free port, loads optional `.env.local` values, seeds development auth for that local process, and opens the Electron app with the cloud URL configured. It does not create, seed, or run missions; paste mission prompts into the Workbench yourself and use the ChatGPT planner handoff from the UI.

## Package Desktop App

```powershell
pnpm desktop:package
```

The unpacked Windows app is written to:

```text
apps/desktop/release/win-unpacked/AgentBridge.exe
```

Production app launches load built renderer files inside Electron, not `127.0.0.1`.

For an installer target:

```powershell
pnpm desktop:dist
```

Code signing and auto-update are future production requirements.

## Load Extension

1. Build with `pnpm --filter @agentbridge/extension build`.
2. Open `chrome://extensions`.
3. Enable developer mode.
4. Load unpacked extension from `apps/extension`.

## First-Run Setup

Open AgentBridge and use Start first. If no ChatGPT tabs are synced, click **Connect Chrome**.

The desktop app will:

1. Register or repair the native messaging host for the configured extension ID.
2. Open the Chrome Web Store listing when `AGENTBRIDGE_CHROME_WEB_STORE_URL` is configured.
3. Show Chrome connection status from the last extension heartbeat.

Then:

1. Open ChatGPT in Chrome.
2. Open the AgentBridge extension.
3. Click **Sync this ChatGPT tab**.
4. Choose a repo in AgentBridge.
5. Create the ChatGPT -> repo -> Codex link.
6. Capture selected text with Ctrl+Shift+Y.
7. Create a Task Card.

Settings still has setup diagnostics, but registry, native-host, local bridge, and helper paths stay behind details.

## Register Native Host

Production builds should set:

```powershell
$env:AGENTBRIDGE_CHROME_EXTENSION_ID="<stable-extension-id>"
$env:AGENTBRIDGE_CHROME_WEB_STORE_URL="https://chromewebstore.google.com/detail/..."
```

The desktop app uses that ID for native-host registration and does not ask the user to paste it.

Development builds can still generate and register the Chrome connection after you paste the unpacked Chrome extension ID in Settings diagnostics.

Manual setup is also available:

1. Build the native host with `pnpm --filter @agentbridge/native-host build`.
2. Generate a launcher and manifest:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/generate-native-host-manifest-windows.ps1 -ExtensionId <chrome-extension-id> -NativeHostScriptPath .\apps\native-host\dist\src\index.js
   ```

3. Register the generated manifest:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/register-native-host-windows.ps1 -ManifestPath "$env:LOCALAPPDATA\AgentBridge\com.agentbridge.native_host.json"
   ```

Unregister:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/unregister-native-host-windows.ps1
```

## Data Location

By default, local data lives at:

```text
%LOCALAPPDATA%\AgentBridge
```

Set `AGENTBRIDGE_STORE_DIR` to override it.

## Known Limitations

- Production native host registration requires `AGENTBRIDGE_CHROME_EXTENSION_ID`.
- Chrome Web Store publishing is needed for a stable production install flow.
- Packaged native-host launch currently assumes Node is available on the machine.
- Extension heartbeat is the desktop source of truth for Chrome connection state.
- Electron packaging is not signed.
- Existing Codex threads can be opened by deep link; sending into existing threads requires Codex App Server or SDK.
- Windows UI Automation support varies by target app.
