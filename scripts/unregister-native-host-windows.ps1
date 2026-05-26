$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.agentbridge.native_host"

if (Test-Path $registryPath) {
  Remove-Item -LiteralPath $registryPath -Force
  Write-Host "Unregistered AgentBridge native host."
} else {
  Write-Host "AgentBridge native host was not registered."
}
