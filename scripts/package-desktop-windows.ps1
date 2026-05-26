param(
  [ValidateSet("dir", "nsis")]
  [string]$Target = "dir"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  pnpm --filter @agentbridge/native-host bundle
  dotnet publish apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj `
    -c Release `
    -r win-x64 `
    --self-contained false `
    -o apps/win-uia-helper/dist/win-x64

  pnpm --filter @agentbridge/desktop build

  if ($Target -eq "dir") {
    pnpm --filter @agentbridge/desktop package
  } else {
    pnpm --filter @agentbridge/desktop dist
  }
} finally {
  Pop-Location
}
