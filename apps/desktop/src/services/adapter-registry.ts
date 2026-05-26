import { AdapterRegistry } from "@agentbridge/core";

export function createDesktopAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();

  registry.register({
    id: "browserTabSource",
    kind: "source",
    label: "Chrome browser tab",
    capabilities: {
      canCaptureSelectedText: true,
      canCaptureLatestMessage: true,
      requiresApproval: true
    },
    health: async () => ({ available: true })
  });

  registry.register({
    id: "codexDeepLinkTarget",
    kind: "target",
    label: "Codex deep link",
    capabilities: {
      canOpenDeepLink: true,
      requiresApproval: true,
      supportsDryRun: true
    },
    health: async () => ({ available: true })
  });

  registry.register({
    id: "windowsDesktopWindowTarget",
    kind: "target",
    label: "Windows desktop window",
    capabilities: {
      canDeliverText: true,
      requiresApproval: true,
      supportsDryRun: true
    },
    health: async () => ({ available: true })
  });

  return registry;
}
