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

Open Settings in the desktop app. The guided setup walks through:

1. Choose repo.
2. Connect Chrome extension.
3. Capture a test selection.
4. Send a dry-run task to Codex.
5. Optional verification commands.

The setup screen presents this as desktop-app onboarding. Registry, native-host, local bridge, and helper paths stay behind diagnostics. After setup is ready, go back to Inbox and create Task Cards from captured browser text.

## Register Native Host

The desktop Settings view can generate and register the development Chrome connection after you paste the unpacked Chrome extension ID.

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

- Native host registration requires the unpacked extension ID.
- Chrome Web Store publishing is needed for a stable production extension ID.
- Packaged native-host launch currently assumes Node is available on the machine.
- The extension popup Health check is still the source of truth for extension-to-native-host connectivity.
- Electron packaging is not signed.
- Codex deep links create new threads only.
- Windows UI Automation support varies by target app.
