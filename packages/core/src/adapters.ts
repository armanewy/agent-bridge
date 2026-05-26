import type {
  AdapterStatus,
  Approval,
  Capture,
  DeliveryAttempt,
  Handoff,
  SourceEndpoint,
  TargetEndpoint,
  TargetValidation,
  Transform
} from "./types.js";
import type { RedactionFinding } from "./types.js";

export interface SourceAdapter {
  readonly kind: string;
  bind(input?: unknown): Promise<SourceEndpoint>;
  capture(source: SourceEndpoint, mode: Capture["captureType"]): Promise<Capture>;
  getStatus(source: SourceEndpoint): Promise<AdapterStatus>;
}

export interface TargetAdapter {
  readonly kind: string;
  bind(input?: unknown): Promise<TargetEndpoint>;
  validate(target: TargetEndpoint): Promise<TargetValidation>;
  deliver(target: TargetEndpoint, handoff: Handoff, approval: Approval): Promise<DeliveryAttempt>;
}

export interface TransformAdapter {
  readonly id: string;
  transform(capture: Capture, recipe: Transform["recipe"]): Promise<Handoff>;
}

export interface RedactionAdapter {
  scan(text: string): Promise<RedactionFinding[]>;
  redact(text: string, findings: RedactionFinding[]): Promise<string>;
}

export interface AuditSink {
  append(event: {
    id: string;
    type: string;
    entityId?: string;
    details: Record<string, unknown>;
    createdAt: string;
  }): Promise<void>;
}
