import type {
  BrowserTabSource,
  Capture,
  CodexDeepLinkTarget,
  Handoff,
  Link,
  SourceEndpoint,
  TargetEndpoint,
  WindowsDesktopWindowTarget
} from "@agentbridge/core";

export interface WindowRevalidation {
  status: "available" | "changed" | "unavailable";
  warnings: string[];
  current?: WindowsDesktopWindowTarget;
}

export interface PreviewRequest {
  captureId: string;
  targetId: string;
  recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
}

export interface DeliveryPreview {
  handoff: Handoff;
  source?: SourceEndpoint | undefined;
  target?: TargetEndpoint | undefined;
  originalCaptureExcerpt: string;
  deliveryStrategy: string;
}

export interface CodexDeliveryRequest {
  target: CodexDeepLinkTarget;
  prompt: string;
  dryRun: boolean;
}

export interface CodexDeliveryResult {
  success: boolean;
  deepLink: string;
  promptLength: number;
  repoPath: string;
  openedAt?: string;
  error?: string;
}

export interface AgentBridgeApi {
  listSources(): Promise<SourceEndpoint[]>;
  listTargets(): Promise<TargetEndpoint[]>;
  listLinks(): Promise<Link[]>;
  listCaptures(): Promise<Capture[]>;
  createLink(input: Omit<Link, "id" | "createdAt" | "updatedAt" | "enabled"> & { name: string }): Promise<Link>;
  previewHandoff(input: PreviewRequest): Promise<DeliveryPreview>;
  revalidateTarget(target: WindowsDesktopWindowTarget): Promise<WindowRevalidation>;
  configureCodexTarget(repoPath: string): Promise<CodexDeepLinkTarget>;
  deliverToCodex(input: CodexDeliveryRequest): Promise<CodexDeliveryResult>;
  bindMockBrowserSource(): Promise<BrowserTabSource>;
}

declare global {
  interface Window {
    agentBridge?: AgentBridgeApi;
  }
}
