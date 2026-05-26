$ErrorActionPreference = "Stop"

pnpm install
pnpm build
dotnet build apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj
pnpm dev:desktop
