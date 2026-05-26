import { app } from "electron";
import { JsonFileStore } from "@agentbridge/local-store";

export function createDesktopStore(): JsonFileStore {
  return new JsonFileStore(app.getPath("userData"));
}
