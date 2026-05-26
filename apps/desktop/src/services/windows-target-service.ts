import { spawn } from "node:child_process";
import { scoreWindowsTargetVerification, type WindowsDesktopWindowTarget } from "@agentbridge/core";
import type { WindowRevalidation } from "./bridge-contract.js";

export interface HelperWindowMetadata {
  hwnd: string;
  processId?: number;
  title: string;
  executablePath?: string;
  className?: string;
  visible?: boolean;
}

export interface HelperResponse {
  success: boolean;
  errors?: string[];
  windows?: HelperWindowMetadata[];
  window?: HelperWindowMetadata;
  candidateControls?: unknown[];
  strategyUsed?: string;
  message?: string;
  chatGptProbe?: ChatGptDesktopProbeReport;
  capturedText?: string;
  visibleMessages?: ChatGptVisibleMessage[];
}

export interface ChatGptDesktopProbeReport {
  supportsWindowDetection: boolean;
  supportsSessionList: boolean;
  supportsSelectedText: boolean;
  supportsLatestMessage: boolean;
  confidence: "high" | "medium" | "low";
  activeConversationTitle?: string;
  rawUiaExcerpt: string[];
  errors: string[];
}

export interface ChatGptVisibleMessage {
  index: number;
  text: string;
  controlType?: string;
  automationId?: string;
  name?: string;
}

export class WindowsTargetService {
  constructor(private readonly helperCommand = "dotnet", private readonly helperArgs: string[] = []) {}

  async listTopLevelWindows(): Promise<WindowsDesktopWindowTarget[]> {
    const response = await this.invoke("listTopLevelWindows");
    return (response.windows ?? []).map((window) => toWindowsTarget(window));
  }

  async listChatGptWindows(): Promise<WindowsDesktopWindowTarget[]> {
    const response = await this.invoke("listChatGptWindows");
    return (response.windows ?? []).map((window) => toWindowsTarget(window));
  }

  async getForegroundWindow(): Promise<WindowsDesktopWindowTarget | undefined> {
    const response = await this.invoke("getForegroundWindow");
    return response.window ? toWindowsTarget(response.window) : undefined;
  }

  async inspectWindow(hwnd: string): Promise<WindowsDesktopWindowTarget | undefined> {
    const response = await this.invoke("inspectWindow", { hwnd });
    return response.window ? toWindowsTarget(response.window) : undefined;
  }

  async findEditableTargets(hwnd: string): Promise<HelperResponse> {
    return this.invoke("findEditableTargets", { hwnd });
  }

  async inspectChatGptWindow(hwnd: string): Promise<HelperResponse> {
    return this.invoke("inspectChatGptWindow", { hwnd });
  }

  async captureChatGptSelectedText(hwnd: string): Promise<HelperResponse> {
    return this.invoke("captureChatGptSelectedText", { hwnd });
  }

  async captureChatGptVisibleMessages(hwnd: string): Promise<HelperResponse> {
    return this.invoke("captureChatGptVisibleMessages", { hwnd });
  }

  async getChatGptActiveConversationCandidate(): Promise<HelperResponse> {
    return this.invoke("getChatGptActiveConversationCandidate");
  }

  async deliverText(
    target: WindowsDesktopWindowTarget,
    text: string,
    strategy: "autoUiaOnly" | "valuePattern" | "clipboardPasteApproved" | "dryRun"
  ): Promise<HelperResponse> {
    return this.invoke("deliverText", { hwnd: target.hwnd, text, strategy });
  }

  async revalidate(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation> {
    const current = await this.inspectWindow(target.hwnd);
    if (!current) {
      return { status: "unavailable", warnings: ["The bound window could not be found."] };
    }

    return scoreTargetMatch(target, current);
  }

  private async invoke(command: string, payload?: unknown): Promise<HelperResponse> {
    const args = this.helperArgs.length > 0
      ? this.helperArgs
      : ["run", "--project", "apps/win-uia-helper/AgentBridge.WinUiaHelper.csproj", "--no-build"];
    const child = spawn(this.helperCommand, args, {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const request = `${JSON.stringify({ command, payload })}\n`;
    child.stdin.end(request, "utf8");

    const stdout = await streamToString(child.stdout);
    const stderr = await streamToString(child.stderr);
    const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));

    if (exitCode !== 0) {
      throw new Error(stderr || `win-uia-helper exited with code ${exitCode}`);
    }

    const line = stdout.trim().split(/\r?\n/).at(-1);
    if (!line) {
      throw new Error("win-uia-helper returned no response.");
    }
    return JSON.parse(line) as HelperResponse;
  }
}

export function toWindowsTarget(metadata: HelperWindowMetadata): WindowsDesktopWindowTarget {
  return {
    id: `target_windows_${metadata.hwnd}`,
    kind: "windowsDesktopWindow",
    hwnd: metadata.hwnd,
    ...(metadata.processId ? { processId: metadata.processId } : {}),
    title: metadata.title,
    ...(metadata.executablePath ? { executablePath: metadata.executablePath } : {}),
    ...(metadata.className ? { className: metadata.className } : {}),
    boundAt: new Date().toISOString()
  };
}

export function scoreTargetMatch(
  original: WindowsDesktopWindowTarget,
  current: WindowsDesktopWindowTarget
): WindowRevalidation {
  const verification = scoreWindowsTargetVerification(original, current);

  return {
    status: verification.status === "pass" ? "available" : "changed",
    warnings: verification.differences,
    current
  };
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      output += chunk;
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(output));
  });
}
