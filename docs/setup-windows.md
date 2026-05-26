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

Open `http://127.0.0.1:5173`.

## Load Extension

1. Build with `pnpm --filter @agentbridge/extension build`.
2. Open `chrome://extensions`.
3. Enable developer mode.
4. Load unpacked extension from `apps/extension`.

## Register Native Host

The desktop Setup view can generate and register the development native-host manifest after you paste the unpacked Chrome extension ID.

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
- The extension popup Health check is still the source of truth for extension-to-native-host connectivity.
- Electron packaging is not signed.
- Codex deep links create new threads only.
- Windows UI Automation support varies by target app.
