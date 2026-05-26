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

1. Copy `apps/native-host/manifest/windows.com.agentbridge.native_host.json`.
2. Replace the host `path` and `allowed_origins` extension ID.
3. Register it:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/register-native-host-windows.ps1 -ManifestPath C:\path\to\manifest.json
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
- Electron packaging is not signed.
- Codex deep links create new threads only.
- Windows UI Automation support varies by target app.
