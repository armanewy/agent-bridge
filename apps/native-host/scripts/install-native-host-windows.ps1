param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

$resolved = Resolve-Path -LiteralPath $ManifestPath
$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.agentbridge.native_host"

New-Item -Path $registryPath -Force | Out-Null
Set-ItemProperty -Path $registryPath -Name "(default)" -Value $resolved.Path

Write-Host "Registered AgentBridge native host manifest:"
Write-Host $resolved.Path
