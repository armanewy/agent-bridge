$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$viteOut = Join-Path $env:TEMP "agentbridge-desktop-vite.out.log"
$viteErr = Join-Path $env:TEMP "agentbridge-desktop-vite.err.log"
$pnpmCommand = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
if (!$pnpmCommand) {
  $pnpmCommand = (Get-Command pnpm -ErrorAction Stop).Source
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Wait-ForViteServer {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)]$Process
  )

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($Process.HasExited) {
      $stderr = if (Test-Path $viteErr) { Get-Content $viteErr -Raw } else { "" }
      throw "Vite dev server exited before Electron could start. $stderr"
    }
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Timed out waiting for Vite dev server at $Url. See $viteOut and $viteErr."
}

$devPort = if ($env:AGENTBRIDGE_DESKTOP_DEV_PORT) { [int]$env:AGENTBRIDGE_DESKTOP_DEV_PORT } else { Get-FreeTcpPort }
$devServerUrl = "http://127.0.0.1:$devPort/"

Push-Location $repoRoot
try {
  pnpm --filter @agentbridge/desktop build

  $vite = Start-Process `
    -FilePath $pnpmCommand `
    -ArgumentList @("--filter", "@agentbridge/desktop", "dev", "--", "--port", "$devPort", "--strictPort") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $viteOut `
    -RedirectStandardError $viteErr `
    -PassThru

  try {
    Wait-ForViteServer -Url $devServerUrl -Process $vite
    $env:VITE_DEV_SERVER_URL = $devServerUrl
    pnpm --filter @agentbridge/desktop exec electron .
  } finally {
    if (!$vite.HasExited) {
      Stop-Process -Id $vite.Id -Force
    }
  }
} finally {
  Pop-Location
}
