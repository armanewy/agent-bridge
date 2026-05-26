# AgentBridge Windows UIA Helper

This is the Wave 2 Windows-native helper. It communicates over line-delimited JSON on stdin/stdout.

## Commands

```json
{"command":"healthCheck"}
{"command":"listTopLevelWindows"}
{"command":"getForegroundWindow"}
{"command":"inspectWindow","payload":{"hwnd":"0x123456"}}
{"command":"findEditableTargets","payload":{"hwnd":"0x123456"}}
{"command":"deliverText","payload":{"hwnd":"0x123456","text":"hello","strategy":"dryRun"}}
```

Delivery strategies:

- `dryRun`: validate and report target metadata without sending text.
- `valuePattern`: attempt `ValuePattern.SetValue` on a writable UIA candidate.
- `autoUiaOnly`: currently uses the same safe UIA ValuePattern path.
- `clipboardPasteApproved`: separate fallback strategy reserved for a later hardening wave.

## Manual Notepad Test

1. Start Notepad.
2. Run:

   ```powershell
   dotnet run --project apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj
   ```

3. Send `{"command":"listTopLevelWindows"}` and copy the Notepad `hwnd`.
4. Send `{"command":"findEditableTargets","payload":{"hwnd":"0x..."}}`.
5. Send `{"command":"deliverText","payload":{"hwnd":"0x...","text":"AgentBridge test","strategy":"valuePattern"}}`.

Clipboard fallback is intentionally not the default and must stay approval-gated.
