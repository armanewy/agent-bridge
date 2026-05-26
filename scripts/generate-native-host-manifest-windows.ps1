param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId,

  [Parameter(Mandatory = $true)]
  [string]$NativeHostScriptPath,

  [string]$OutputDir = "$env:LOCALAPPDATA\AgentBridge"
)

$resolvedScript = Resolve-Path -LiteralPath $NativeHostScriptPath
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$launcherPath = Join-Path $OutputDir "agentbridge-native-host.cmd"
$manifestPath = Join-Path $OutputDir "com.agentbridge.native_host.json"

$launcher = "@echo off`r`nnode `"$($resolvedScript.Path)`"`r`n"
Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding UTF8

$manifest = [ordered]@{
  name = "com.agentbridge.native_host"
  description = "AgentBridge local native messaging host"
  path = $launcherPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Generated native host launcher:"
Write-Host $launcherPath
Write-Host "Generated native host manifest:"
Write-Host $manifestPath
