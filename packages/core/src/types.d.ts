import { z } from "zod";
export declare const TimestampSchema: z.ZodString;
export declare const LinkSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    sourceId: z.ZodString;
    targetId: z.ZodString;
    transformId: z.ZodString;
    deliveryMode: z.ZodEnum<["codexDeepLink", "windowsUia", "clipboardFallbackApproved", "dryRun"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    sourceId: string;
    targetId: string;
    transformId: string;
    deliveryMode: "codexDeepLink" | "windowsUia" | "clipboardFallbackApproved" | "dryRun";
    createdAt: string;
    updatedAt: string;
    enabled: boolean;
}, {
    id: string;
    name: string;
    sourceId: string;
    targetId: string;
    transformId: string;
    deliveryMode: "codexDeepLink" | "windowsUia" | "clipboardFallbackApproved" | "dryRun";
    createdAt: string;
    updatedAt: string;
    enabled: boolean;
}>;
export type Link = z.infer<typeof LinkSchema>;
export declare const BrowserTabSourceSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"browserTab">;
    browser: z.ZodLiteral<"chrome">;
    tabId: z.ZodOptional<z.ZodNumber>;
    windowId: z.ZodOptional<z.ZodNumber>;
    title: z.ZodString;
    url: z.ZodString;
    favIconUrl: z.ZodOptional<z.ZodString>;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "browserTab";
    browser: "chrome";
    title: string;
    url: string;
    boundAt: string;
    tabId?: number | undefined;
    windowId?: number | undefined;
    favIconUrl?: string | undefined;
}, {
    id: string;
    kind: "browserTab";
    browser: "chrome";
    title: string;
    url: string;
    boundAt: string;
    tabId?: number | undefined;
    windowId?: number | undefined;
    favIconUrl?: string | undefined;
}>;
export type BrowserTabSource = z.infer<typeof BrowserTabSourceSchema>;
export declare const SourceEndpointSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"browserTab">;
    browser: z.ZodLiteral<"chrome">;
    tabId: z.ZodOptional<z.ZodNumber>;
    windowId: z.ZodOptional<z.ZodNumber>;
    title: z.ZodString;
    url: z.ZodString;
    favIconUrl: z.ZodOptional<z.ZodString>;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "browserTab";
    browser: "chrome";
    title: string;
    url: string;
    boundAt: string;
    tabId?: number | undefined;
    windowId?: number | undefined;
    favIconUrl?: string | undefined;
}, {
    id: string;
    kind: "browserTab";
    browser: "chrome";
    title: string;
    url: string;
    boundAt: string;
    tabId?: number | undefined;
    windowId?: number | undefined;
    favIconUrl?: string | undefined;
}>]>;
export type SourceEndpoint = z.infer<typeof SourceEndpointSchema>;
export declare const WindowsDesktopWindowTargetSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"windowsDesktopWindow">;
    hwnd: z.ZodString;
    processId: z.ZodOptional<z.ZodNumber>;
    title: z.ZodString;
    executablePath: z.ZodOptional<z.ZodString>;
    className: z.ZodOptional<z.ZodString>;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "windowsDesktopWindow";
    title: string;
    boundAt: string;
    hwnd: string;
    processId?: number | undefined;
    executablePath?: string | undefined;
    className?: string | undefined;
}, {
    id: string;
    kind: "windowsDesktopWindow";
    title: string;
    boundAt: string;
    hwnd: string;
    processId?: number | undefined;
    executablePath?: string | undefined;
    className?: string | undefined;
}>;
export type WindowsDesktopWindowTarget = z.infer<typeof WindowsDesktopWindowTargetSchema>;
export declare const CodexDeepLinkTargetSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"codexDeepLink">;
    repoPath: z.ZodString;
    originUrl: z.ZodOptional<z.ZodString>;
    existingThreadId: z.ZodOptional<z.ZodString>;
    openMode: z.ZodLiteral<"newThread">;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "codexDeepLink";
    boundAt: string;
    repoPath: string;
    openMode: "newThread";
    originUrl?: string | undefined;
    existingThreadId?: string | undefined;
}, {
    id: string;
    kind: "codexDeepLink";
    boundAt: string;
    repoPath: string;
    openMode: "newThread";
    originUrl?: string | undefined;
    existingThreadId?: string | undefined;
}>;
export type CodexDeepLinkTarget = z.infer<typeof CodexDeepLinkTargetSchema>;
export declare const ClipboardFallbackTargetSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"clipboardFallback">;
    parentTargetId: z.ZodString;
    requiresExplicitApproval: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "clipboardFallback";
    parentTargetId: string;
    requiresExplicitApproval: true;
}, {
    id: string;
    kind: "clipboardFallback";
    parentTargetId: string;
    requiresExplicitApproval: true;
}>;
export type ClipboardFallbackTarget = z.infer<typeof ClipboardFallbackTargetSchema>;
export declare const TargetEndpointSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"windowsDesktopWindow">;
    hwnd: z.ZodString;
    processId: z.ZodOptional<z.ZodNumber>;
    title: z.ZodString;
    executablePath: z.ZodOptional<z.ZodString>;
    className: z.ZodOptional<z.ZodString>;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "windowsDesktopWindow";
    title: string;
    boundAt: string;
    hwnd: string;
    processId?: number | undefined;
    executablePath?: string | undefined;
    className?: string | undefined;
}, {
    id: string;
    kind: "windowsDesktopWindow";
    title: string;
    boundAt: string;
    hwnd: string;
    processId?: number | undefined;
    executablePath?: string | undefined;
    className?: string | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"codexDeepLink">;
    repoPath: z.ZodString;
    originUrl: z.ZodOptional<z.ZodString>;
    existingThreadId: z.ZodOptional<z.ZodString>;
    openMode: z.ZodLiteral<"newThread">;
    boundAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "codexDeepLink";
    boundAt: string;
    repoPath: string;
    openMode: "newThread";
    originUrl?: string | undefined;
    existingThreadId?: string | undefined;
}, {
    id: string;
    kind: "codexDeepLink";
    boundAt: string;
    repoPath: string;
    openMode: "newThread";
    originUrl?: string | undefined;
    existingThreadId?: string | undefined;
}>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"clipboardFallback">;
    parentTargetId: z.ZodString;
    requiresExplicitApproval: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "clipboardFallback";
    parentTargetId: string;
    requiresExplicitApproval: true;
}, {
    id: string;
    kind: "clipboardFallback";
    parentTargetId: string;
    requiresExplicitApproval: true;
}>]>;
export type TargetEndpoint = z.infer<typeof TargetEndpointSchema>;
export declare const CaptureSchema: z.ZodObject<{
    id: z.ZodString;
    sourceId: z.ZodString;
    captureType: z.ZodEnum<["selectedText", "latestMessage", "pageTextSummary"]>;
    text: z.ZodString;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodString;
    userTriggered: z.ZodLiteral<true>;
}, "strip", z.ZodTypeAny, {
    id: string;
    sourceId: string;
    createdAt: string;
    captureType: "selectedText" | "latestMessage" | "pageTextSummary";
    text: string;
    metadata: Record<string, unknown>;
    userTriggered: true;
}, {
    id: string;
    sourceId: string;
    createdAt: string;
    captureType: "selectedText" | "latestMessage" | "pageTextSummary";
    text: string;
    userTriggered: true;
    metadata?: Record<string, unknown> | undefined;
}>;
export type Capture = z.infer<typeof CaptureSchema>;
export declare const RedactionFindingSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<["apiKey", "bearerToken", "privateKey", "envAssignment", "email", "highEntropyToken"]>;
    severity: z.ZodEnum<["high", "medium", "low"]>;
    start: z.ZodNumber;
    end: z.ZodNumber;
    preview: z.ZodString;
    recommendation: z.ZodEnum<["redact", "warn"]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
    severity: "high" | "medium" | "low";
    start: number;
    end: number;
    preview: string;
    recommendation: "redact" | "warn";
}, {
    id: string;
    kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
    severity: "high" | "medium" | "low";
    start: number;
    end: number;
    preview: string;
    recommendation: "redact" | "warn";
}>;
export type RedactionFinding = z.infer<typeof RedactionFindingSchema>;
export declare const StructuredHandoffSchema: z.ZodObject<{
    goal: z.ZodString;
    context: z.ZodString;
    constraints: z.ZodArray<z.ZodString, "many">;
    acceptanceCriteria: z.ZodArray<z.ZodString, "many">;
    suggestedFiles: z.ZodArray<z.ZodString, "many">;
    verificationSteps: z.ZodArray<z.ZodString, "many">;
    originalCaptureRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    goal: string;
    context: string;
    constraints: string[];
    acceptanceCriteria: string[];
    suggestedFiles: string[];
    verificationSteps: string[];
    originalCaptureRef: string;
}, {
    goal: string;
    context: string;
    constraints: string[];
    acceptanceCriteria: string[];
    suggestedFiles: string[];
    verificationSteps: string[];
    originalCaptureRef: string;
}>;
export type StructuredHandoff = z.infer<typeof StructuredHandoffSchema>;
export declare const HandoffSchema: z.ZodObject<{
    id: z.ZodString;
    captureId: z.ZodString;
    sourceId: z.ZodString;
    targetId: z.ZodString;
    transformId: z.ZodString;
    prompt: z.ZodString;
    structured: z.ZodObject<{
        goal: z.ZodString;
        context: z.ZodString;
        constraints: z.ZodArray<z.ZodString, "many">;
        acceptanceCriteria: z.ZodArray<z.ZodString, "many">;
        suggestedFiles: z.ZodArray<z.ZodString, "many">;
        verificationSteps: z.ZodArray<z.ZodString, "many">;
        originalCaptureRef: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        goal: string;
        context: string;
        constraints: string[];
        acceptanceCriteria: string[];
        suggestedFiles: string[];
        verificationSteps: string[];
        originalCaptureRef: string;
    }, {
        goal: string;
        context: string;
        constraints: string[];
        acceptanceCriteria: string[];
        suggestedFiles: string[];
        verificationSteps: string[];
        originalCaptureRef: string;
    }>;
    redactionFindings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<["apiKey", "bearerToken", "privateKey", "envAssignment", "email", "highEntropyToken"]>;
        severity: z.ZodEnum<["high", "medium", "low"]>;
        start: z.ZodNumber;
        end: z.ZodNumber;
        preview: z.ZodString;
        recommendation: z.ZodEnum<["redact", "warn"]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
        severity: "high" | "medium" | "low";
        start: number;
        end: number;
        preview: string;
        recommendation: "redact" | "warn";
    }, {
        id: string;
        kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
        severity: "high" | "medium" | "low";
        start: number;
        end: number;
        preview: string;
        recommendation: "redact" | "warn";
    }>, "many">;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    sourceId: string;
    targetId: string;
    transformId: string;
    createdAt: string;
    captureId: string;
    prompt: string;
    structured: {
        goal: string;
        context: string;
        constraints: string[];
        acceptanceCriteria: string[];
        suggestedFiles: string[];
        verificationSteps: string[];
        originalCaptureRef: string;
    };
    redactionFindings: {
        id: string;
        kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
        severity: "high" | "medium" | "low";
        start: number;
        end: number;
        preview: string;
        recommendation: "redact" | "warn";
    }[];
}, {
    id: string;
    sourceId: string;
    targetId: string;
    transformId: string;
    createdAt: string;
    captureId: string;
    prompt: string;
    structured: {
        goal: string;
        context: string;
        constraints: string[];
        acceptanceCriteria: string[];
        suggestedFiles: string[];
        verificationSteps: string[];
        originalCaptureRef: string;
    };
    redactionFindings: {
        id: string;
        kind: "apiKey" | "bearerToken" | "privateKey" | "envAssignment" | "email" | "highEntropyToken";
        severity: "high" | "medium" | "low";
        start: number;
        end: number;
        preview: string;
        recommendation: "redact" | "warn";
    }[];
}>;
export type Handoff = z.infer<typeof HandoffSchema>;
export declare const TransformSchema: z.ZodObject<{
    id: z.ZodString;
    recipe: z.ZodEnum<["rawRelay", "implementationBrief", "codeReviewRequest", "debuggingRequest"]>;
    inputCaptureId: z.ZodString;
    outputHandoffId: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
    inputCaptureId: string;
    outputHandoffId: string;
}, {
    id: string;
    createdAt: string;
    recipe: "rawRelay" | "implementationBrief" | "codeReviewRequest" | "debuggingRequest";
    inputCaptureId: string;
    outputHandoffId: string;
}>;
export type Transform = z.infer<typeof TransformSchema>;
export declare const ApprovalSchema: z.ZodObject<{
    id: z.ZodString;
    handoffId: z.ZodString;
    decision: z.ZodEnum<["approved", "cancelled", "edited"]>;
    editedPrompt: z.ZodOptional<z.ZodString>;
    approvedFallbackStrategies: z.ZodArray<z.ZodString, "many">;
    approvedAt: z.ZodOptional<z.ZodString>;
    cancelledAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    handoffId: string;
    decision: "approved" | "cancelled" | "edited";
    approvedFallbackStrategies: string[];
    editedPrompt?: string | undefined;
    approvedAt?: string | undefined;
    cancelledAt?: string | undefined;
}, {
    id: string;
    handoffId: string;
    decision: "approved" | "cancelled" | "edited";
    approvedFallbackStrategies: string[];
    editedPrompt?: string | undefined;
    approvedAt?: string | undefined;
    cancelledAt?: string | undefined;
}>;
export type Approval = z.infer<typeof ApprovalSchema>;
export declare const DeliveryAttemptSchema: z.ZodObject<{
    id: z.ZodString;
    handoffId: z.ZodString;
    targetId: z.ZodString;
    strategy: z.ZodEnum<["codexDeepLink", "autoUiaOnly", "valuePattern", "clipboardPasteApproved", "dryRun"]>;
    success: z.ZodBoolean;
    warnings: z.ZodArray<z.ZodString, "many">;
    error: z.ZodOptional<z.ZodString>;
    targetMetadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    attemptedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    targetId: string;
    handoffId: string;
    strategy: "codexDeepLink" | "dryRun" | "autoUiaOnly" | "valuePattern" | "clipboardPasteApproved";
    success: boolean;
    warnings: string[];
    targetMetadata: Record<string, unknown>;
    attemptedAt: string;
    error?: string | undefined;
}, {
    id: string;
    targetId: string;
    handoffId: string;
    strategy: "codexDeepLink" | "dryRun" | "autoUiaOnly" | "valuePattern" | "clipboardPasteApproved";
    success: boolean;
    warnings: string[];
    targetMetadata: Record<string, unknown>;
    attemptedAt: string;
    error?: string | undefined;
}>;
export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;
export declare const AuditEventSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["sourceBound", "targetBound", "captureCreated", "transformCreated", "approvalGranted", "approvalCancelled", "deliveryAttempted", "deliverySucceeded", "deliveryFailed", "redactionWarningShown"]>;
    entityId: z.ZodOptional<z.ZodString>;
    details: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "sourceBound" | "targetBound" | "captureCreated" | "transformCreated" | "approvalGranted" | "approvalCancelled" | "deliveryAttempted" | "deliverySucceeded" | "deliveryFailed" | "redactionWarningShown";
    createdAt: string;
    details: Record<string, unknown>;
    entityId?: string | undefined;
}, {
    id: string;
    type: "sourceBound" | "targetBound" | "captureCreated" | "transformCreated" | "approvalGranted" | "approvalCancelled" | "deliveryAttempted" | "deliverySucceeded" | "deliveryFailed" | "redactionWarningShown";
    createdAt: string;
    details: Record<string, unknown>;
    entityId?: string | undefined;
}>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export declare const SettingSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodUnknown;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    updatedAt: string;
    key: string;
    value?: unknown;
}, {
    updatedAt: string;
    key: string;
    value?: unknown;
}>;
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
//# sourceMappingURL=types.d.ts.map