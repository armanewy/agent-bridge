import { z } from "zod";

export const TimestampSchema = z.string().min(1);

export const LinkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  transformId: z.string().min(1),
  deliveryMode: z.enum(["codexDeepLink", "windowsUia", "clipboardFallbackApproved", "dryRun"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  enabled: z.boolean()
});
export type Link = z.infer<typeof LinkSchema>;

export const BrowserTabSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("browserTab"),
  browser: z.literal("chrome"),
  tabId: z.number().int().optional(),
  windowId: z.number().int().optional(),
  title: z.string(),
  url: z.string().url(),
  favIconUrl: z.string().url().optional(),
  boundAt: TimestampSchema
});
export type BrowserTabSource = z.infer<typeof BrowserTabSourceSchema>;

export const SourceEndpointSchema = z.discriminatedUnion("kind", [BrowserTabSourceSchema]);
export type SourceEndpoint = z.infer<typeof SourceEndpointSchema>;

export const WindowsDesktopWindowTargetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("windowsDesktopWindow"),
  hwnd: z.string().min(1),
  processId: z.number().int().positive().optional(),
  title: z.string(),
  executablePath: z.string().optional(),
  className: z.string().optional(),
  boundAt: TimestampSchema
});
export type WindowsDesktopWindowTarget = z.infer<typeof WindowsDesktopWindowTargetSchema>;

export const CodexDeepLinkTargetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("codexDeepLink"),
  repoPath: z.string().min(1),
  originUrl: z.string().url().optional(),
  existingThreadId: z.string().optional(),
  openMode: z.literal("newThread"),
  boundAt: TimestampSchema
});
export type CodexDeepLinkTarget = z.infer<typeof CodexDeepLinkTargetSchema>;

export const ClipboardFallbackTargetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("clipboardFallback"),
  parentTargetId: z.string().min(1),
  requiresExplicitApproval: z.literal(true)
});
export type ClipboardFallbackTarget = z.infer<typeof ClipboardFallbackTargetSchema>;

export const TargetEndpointSchema = z.discriminatedUnion("kind", [
  WindowsDesktopWindowTargetSchema,
  CodexDeepLinkTargetSchema,
  ClipboardFallbackTargetSchema
]);
export type TargetEndpoint = z.infer<typeof TargetEndpointSchema>;

export const CaptureSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  captureType: z.enum(["selectedText", "latestMessage", "pageTextSummary"]),
  text: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  createdAt: TimestampSchema,
  userTriggered: z.literal(true)
});
export type Capture = z.infer<typeof CaptureSchema>;

export const RedactionFindingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["apiKey", "bearerToken", "privateKey", "envAssignment", "email", "highEntropyToken"]),
  severity: z.enum(["high", "medium", "low"]),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  preview: z.string(),
  recommendation: z.enum(["redact", "warn"])
});
export type RedactionFinding = z.infer<typeof RedactionFindingSchema>;

export const StructuredHandoffSchema = z.object({
  goal: z.string(),
  context: z.string(),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  suggestedFiles: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  originalCaptureRef: z.string().min(1)
});
export type StructuredHandoff = z.infer<typeof StructuredHandoffSchema>;

export const HandoffSchema = z.object({
  id: z.string().min(1),
  captureId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  transformId: z.string().min(1),
  prompt: z.string().min(1),
  structured: StructuredHandoffSchema,
  redactionFindings: z.array(RedactionFindingSchema),
  createdAt: TimestampSchema
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const TransformSchema = z.object({
  id: z.string().min(1),
  recipe: z.enum(["rawRelay", "implementationBrief", "codeReviewRequest", "debuggingRequest"]),
  inputCaptureId: z.string().min(1),
  outputHandoffId: z.string().min(1),
  createdAt: TimestampSchema
});
export type Transform = z.infer<typeof TransformSchema>;

export const ApprovalSchema = z.object({
  id: z.string().min(1),
  handoffId: z.string().min(1),
  decision: z.enum(["approved", "cancelled", "edited"]),
  editedPrompt: z.string().optional(),
  approvedFallbackStrategies: z.array(z.string()),
  approvedAt: TimestampSchema.optional(),
  cancelledAt: TimestampSchema.optional()
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const DeliveryAttemptSchema = z.object({
  id: z.string().min(1),
  handoffId: z.string().min(1),
  targetId: z.string().min(1),
  strategy: z.enum(["codexDeepLink", "autoUiaOnly", "valuePattern", "clipboardPasteApproved", "dryRun"]),
  success: z.boolean(),
  warnings: z.array(z.string()),
  error: z.string().optional(),
  targetMetadata: z.record(z.unknown()),
  attemptedAt: TimestampSchema
});
export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;

export const AuditEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "sourceBound",
    "targetBound",
    "captureCreated",
    "transformCreated",
    "approvalGranted",
    "approvalCancelled",
    "deliveryAttempted",
    "deliverySucceeded",
    "deliveryFailed",
    "redactionWarningShown"
  ]),
  entityId: z.string().optional(),
  details: z.record(z.unknown()),
  createdAt: TimestampSchema
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: TimestampSchema
});
export type Setting = z.infer<typeof SettingSchema>;

export interface AdapterStatus {
  available: boolean;
  message?: string;
  checkedAt: string;
}

export interface TargetValidation {
  available: boolean;
  changed: boolean;
  warnings: string[];
  resolvedTarget?: TargetEndpoint;
  checkedAt: string;
}
