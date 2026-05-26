import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultAgentBridgeDataDir } from "@agentbridge/local-store";

export function defaultDevLogPath(): string {
  return join(defaultAgentBridgeDataDir(), "native-host-dev-log.jsonl");
}

export async function appendDevLog(entry: unknown, filePath = defaultDevLogPath()): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}
