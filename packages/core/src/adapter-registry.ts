export interface AdapterCapabilities {
  canCaptureSelectedText?: boolean;
  canCaptureLatestMessage?: boolean;
  canDeliverText?: boolean;
  canOpenDeepLink?: boolean;
  requiresApproval?: boolean;
  supportsDryRun?: boolean;
}

export interface RegisteredAdapter {
  id: string;
  kind: "source" | "target" | "transform" | "redaction";
  label: string;
  capabilities: AdapterCapabilities;
  health(): Promise<{ available: boolean; message?: string }>;
}

export class AdapterRegistry {
  private readonly adapters = new Map<string, RegisteredAdapter>();

  register(adapter: RegisteredAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): RegisteredAdapter | undefined {
    return this.adapters.get(id);
  }

  list(kind?: RegisteredAdapter["kind"]): RegisteredAdapter[] {
    return [...this.adapters.values()].filter((adapter) => !kind || adapter.kind === kind);
  }
}
