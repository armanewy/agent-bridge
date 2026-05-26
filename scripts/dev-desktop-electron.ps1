$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$viteOut = Join-Path $env:TEMP "agentbridge-desktop-vite.out.log"
$viteErr = Join-Path $env:TEMP "agentbridge-desktop-vite.err.log"

Push-Location $repoRoot
try {
  pnpm --filter @agentbridge/desktop build

  $vite = Start-Process `
    -FilePath "pnpm" `
    -ArgumentList @("--filter", "@agentbridge/desktop", "dev") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $viteOut `
    -RedirectStandardError $viteErr `
    -PassThru

  try {
    Start-Sleep -Seconds 2
    $env:VITE_DEV_SERVER_URL = "http://127.0.0.1:5173/"
    pnpm --filter @agentbridge/desktop exec electron .
  } finally {
    if (!$vite.HasExited) {
      Stop-Process -Id $vite.Id -Force
    }
  }
} finally {
  Pop-Location
}
