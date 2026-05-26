# AgentBridge Native Host

This package implements Chrome native messaging framing and a development host for Wave 2.

## Build And Test

```powershell
pnpm --filter @agentbridge/native-host build
pnpm --filter @agentbridge/native-host test
```

## Development Manifest

Copy `manifest/windows.com.agentbridge.native_host.json`, replace:

- `path` with the absolute path to the built host launcher.
- `allowed_origins` with the Chrome extension ID after loading the unpacked extension.

Then register it:

```powershell
powershell -ExecutionPolicy Bypass -File apps/native-host/scripts/install-native-host-windows.ps1 -ManifestPath C:\path\to\manifest.json
```

The Wave 2 host writes received events to `%LOCALAPPDATA%\AgentBridge\native-host-dev-log.jsonl` until the desktop service is implemented.
