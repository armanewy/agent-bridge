param(
  [switch]$MockPlanner,
  [switch]$NoDevSignIn,
  [int]$CloudPort = 0,
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$cloudOut = Join-Path $env:TEMP "agentbridge-cloud.out.log"
$cloudErr = Join-Path $env:TEMP "agentbridge-cloud.err.log"

function Import-DotEnvFile {
  param([Parameter(Mandatory=$true)][string]$Path)

  if (!(Test-Path $Path)) {
    return
  }

  foreach ($rawLine in Get-Content $Path) {
    $line = $rawLine.Trim()
    if (!$line -or $line.StartsWith("#")) {
      continue
    }

    $match = [regex]::Match($line, "^(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)$")
    if (!$match.Success) {
      continue
    }

    $key = $match.Groups["key"].Value
    if ([Environment]::GetEnvironmentVariable($key, "Process")) {
      continue
    }

    $value = $match.Groups["value"].Value.Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
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

function Wait-ForHttp {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)]$Process,
    [Parameter(Mandatory=$true)][string]$Name
  )

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($Process.HasExited) {
      $stderr = if (Test-Path $cloudErr) { Get-Content $cloudErr -Raw } else { "" }
      throw "$Name exited before it became ready. $stderr"
    }
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Timed out waiting for $Name at $Url. See $cloudOut and $cloudErr."
}

function Get-DesktopDataDir {
  if ($env:AGENTBRIDGE_STORE_DIR) {
    return $env:AGENTBRIDGE_STORE_DIR
  }
  if ($env:APPDATA) {
    return Join-Path $env:APPDATA "@agentbridge\desktop"
  }
  if ($IsMacOS) {
    return Join-Path $HOME "Library/Application Support/@agentbridge/desktop"
  }
  $configHome = $env:XDG_CONFIG_HOME
  if (!$configHome) {
    $configHome = Join-Path $HOME ".config"
  }
  return Join-Path $configHome "@agentbridge/desktop"
}

function Set-DesktopDevAuth {
  param([Parameter(Mandatory=$true)][string]$CloudBaseUrl)

  $login = Invoke-RestMethod -Method Post -Uri "$CloudBaseUrl/v1/auth/session/dev-login" -ContentType "application/json"
  $dataDir = Get-DesktopDataDir
  $authPath = Join-Path $dataDir "agentbridge-auth.json"
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

  $auth = @{}
  if (Test-Path $authPath) {
    $existing = Get-Content $authPath -Raw | ConvertFrom-Json
    if ($existing) {
      foreach ($property in $existing.PSObject.Properties) {
        $auth[$property.Name] = [string]$property.Value
      }
    }
  }
  $auth["agentbridge.cloud.token"] = $login.token
  $auth["agentbridge.cloud.user"] = ($login.user | ConvertTo-Json -Compress)
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($authPath, ($auth | ConvertTo-Json -Depth 5), $utf8NoBom)
  Write-Host "Dev auth: signed in to local AgentBridge Cloud as $($login.user.email)"
}

Push-Location $repoRoot
try {
  Import-DotEnvFile -Path (Join-Path $repoRoot $EnvFile)

  if (!$env:AGENTBRIDGE_CLOUD_ALLOW_DEV_LOGIN) {
    $env:AGENTBRIDGE_CLOUD_ALLOW_DEV_LOGIN = "1"
  }
  if ($MockPlanner) {
    $env:AGENTBRIDGE_CLOUD_MOCK = "1"
  }
  if (!$env:OPENAI_API_KEY -and !$env:AGENTBRIDGE_CLOUD_MOCK) {
    $env:AGENTBRIDGE_CLOUD_MOCK = "1"
    Write-Warning "OPENAI_API_KEY is not set; starting AgentBridge Cloud in deterministic mock planner mode."
  }

  if ($CloudPort -le 0) {
    $CloudPort = Get-FreeTcpPort
  }
  $env:AGENTBRIDGE_CLOUD_PORT = "$CloudPort"
  $env:AGENTBRIDGE_CLOUD_URL = "http://127.0.0.1:$CloudPort"

  pnpm --filter @agentbridge/cloud build

  $nodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (!$nodeCommand) {
    $nodeCommand = (Get-Command node -ErrorAction Stop).Source
  }

  $cloud = Start-Process `
    -FilePath $nodeCommand `
    -ArgumentList @("apps/cloud/dist/src/index.js") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $cloudOut `
    -RedirectStandardError $cloudErr `
    -PassThru

  try {
    Wait-ForHttp -Url "$env:AGENTBRIDGE_CLOUD_URL/health" -Process $cloud -Name "AgentBridge Cloud"
    if (!$NoDevSignIn) {
      Set-DesktopDevAuth -CloudBaseUrl $env:AGENTBRIDGE_CLOUD_URL
    }
    Write-Host "AgentBridge Cloud: $env:AGENTBRIDGE_CLOUD_URL"
    Write-Host "Planner mode: $(if ($env:AGENTBRIDGE_CLOUD_MOCK) { 'mock' } else { 'OpenAI' })"
    pnpm desktop:dev
  } finally {
    if (!$cloud.HasExited) {
      Stop-Process -Id $cloud.Id -Force
    }
  }
} finally {
  Pop-Location
}
