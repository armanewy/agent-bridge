import { JsonFileStore, defaultAgentBridgeDataDir } from "@agentbridge/local-store";

export function createDesktopStore(): JsonFileStore {
  return new JsonFileStore(defaultAgentBridgeDataDir());
}
