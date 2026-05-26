import { JsonFileStore, defaultAgentBridgeDataDir } from "@agentbridge/local-store";

export function createDesktopStore(rootDir = defaultAgentBridgeDataDir()): JsonFileStore {
  return new JsonFileStore(rootDir);
}
