import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import {
  HostedPlannerReviewResponseSchema,
  HostedPlannerTaskSpecResponseSchema,
  TaskSpecSchema,
  type HostedPlannerReviewResponse,
  type HostedPlannerTaskSpecResponse,
  type TaskSpec
} from "@agentbridge/core";

export interface CloudConfig {
  port: number;
  openAiApiKey?: string | undefined;
  openAiApiKeyConfigured: boolean;
  mockPlanner: boolean;
  openAiModel: string;
  logRawPayloads: boolean;
  maxPlannerPayloadBytes: number;
  allowFileUploads: boolean;
}

export interface CloudRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface CloudResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface RequestLogEntry {
  requestId: string;
  route: string;
  userId?: string;
  status: number;
  timestamp: string;
}

export interface CloudPlannerRequest {
  model: string;
  instructions: string;
  input: string;
  metadata?: Record<string, unknown>;
}

export interface CloudPlannerUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CloudPlannerResponse {
  responseId: string;
  outputText: string;
  usage?: CloudPlannerUsage;
  metadata?: Record<string, unknown>;
}

export interface CloudPlannerTransport {
  createResponse(request: CloudPlannerRequest): Promise<CloudPlannerResponse>;
}

export interface AgentBridgeCloudAppOptions {
  plannerTransport?: CloudPlannerTransport;
}

interface PlannerSessionMetadata {
  sessionId: string;
  userId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  externalConversationId?: string;
}

const DEV_USER = {
  id: "user_dev",
  email: "dev@agentbridge.local"
};

const PLANNER_SYSTEM_PROMPT = [
  "You are AgentBridge Hosted Planner.",
  "Produce coding direction, acceptance criteria, constraints, and review feedback.",
  "Prefer scoped, verifiable tasks. Do not ask for repo files unless the desktop payload explicitly includes approved artifacts."
].join(" ");

export class AgentBridgeCloudApp {
  private readonly requestLogs: RequestLogEntry[] = [];
  private readonly usage: Array<Record<string, unknown>> = [];
  private readonly devTokens = new Set<string>();
  private readonly sessions = new Map<string, PlannerSessionMetadata>();
  private readonly plannerTransport: CloudPlannerTransport | undefined;

  constructor(
    private readonly config: CloudConfig = loadConfig(),
    options: AgentBridgeCloudAppOptions = {}
  ) {
    this.plannerTransport =
      options.plannerTransport ??
      (config.mockPlanner ? new DeterministicMockPlannerTransport() : undefined) ??
      (config.openAiApiKey ? new OpenAIResponsesPlannerTransport(config.openAiApiKey) : undefined);
  }

  getRequestLogs(): RequestLogEntry[] {
    return [...this.requestLogs];
  }

  getUsageRecords(): Array<Record<string, unknown>> {
    return [...this.usage];
  }

  async handle(request: CloudRequest): Promise<CloudResponse> {
    const requestId = `req_${randomUUID()}`;
    const route = `${request.method.toUpperCase()} ${request.path}`;
    let status = 404;
    let userId: string | undefined;
    try {
      const method = request.method.toUpperCase();
      if (method === "GET" && request.path === "/health") {
        status = 200;
        return { status, body: { ok: true, requestId } };
      }
      if (method === "POST" && request.path === "/v1/auth/session/dev-login") {
        const token = `dev_${randomUUID()}`;
        this.devTokens.add(token);
        userId = DEV_USER.id;
        status = 200;
        return { status, body: { token, user: DEV_USER, requestId } };
      }
      if (method === "POST" && request.path === "/v1/auth/session/logout") {
        const token = bearerToken(request.headers);
        if (token) {
          this.devTokens.delete(token);
        }
        status = 200;
        return { status, body: { ok: true, requestId } };
      }

      const auth = this.requireAuth(request);
      userId = auth.userId;

      if (method === "GET" && request.path === "/v1/me") {
        status = 200;
        return { status, body: { user: DEV_USER, requestId } };
      }
      if (method === "GET" && request.path === "/v1/usage/me") {
        status = 200;
        return { status, body: { usage: this.usage, requestId } };
      }
      if (method === "POST" && request.path === "/v1/planner/sessions") {
        this.ensurePlannerPayloadAllowed(request.body);
        const sessionId = `planner_session_${randomUUID()}`;
        const createdAt = now();
        this.sessions.set(sessionId, {
          sessionId,
          userId,
          model: this.config.openAiModel,
          createdAt,
          updatedAt: createdAt
        });
        status = 200;
        this.recordUsage({ userId, route: request.path, status, body: request.body });
        return { status, body: { sessionId, createdAt, metadata: { model: this.config.openAiModel }, requestId } };
      }
      const messageMatch = request.path.match(/^\/v1\/planner\/sessions\/([^/]+)\/messages$/);
      if (method === "POST" && messageMatch) {
        this.ensurePlannerPayloadAllowed(request.body);
        const sessionId = messageMatch[1] ?? "";
        this.requireSession(userId, sessionId);
        const planner = this.requirePlannerTransport();
        const plannerResponse = await planner.createResponse({
          model: this.config.openAiModel,
          instructions: PLANNER_SYSTEM_PROMPT,
          input: renderPlannerMessagePrompt(request.body),
          metadata: { route: "message", sessionId }
        });
        this.touchSession(sessionId);
        status = 200;
        this.recordUsage({
          userId,
          route: request.path,
          status,
          body: request.body,
          model: this.config.openAiModel,
          ...(plannerResponse.usage ? { usage: plannerResponse.usage } : {})
        });
        return {
          status,
          body: {
            sessionId,
            turnId: plannerResponse.responseId,
            content: plannerResponse.outputText,
            createdAt: now(),
            metadata: { model: this.config.openAiModel, ...(plannerResponse.metadata ?? {}) },
            requestId
          }
        };
      }
      if (method === "POST" && request.path === "/v1/planner/task-spec") {
        this.ensurePlannerPayloadAllowed(request.body);
        const planner = this.requirePlannerTransport();
        const taskSpecResult = await this.createTaskSpec(planner, request.body);
        status = 200;
        const response: HostedPlannerTaskSpecResponse = {
          taskSpec: taskSpecResult.taskSpec,
          requestId,
          createdAt: now(),
          metadata: {
            model: this.config.openAiModel,
            responseId: taskSpecResult.response.responseId,
            repaired: taskSpecResult.repaired
          }
        };
        this.recordUsage({
          userId,
          route: request.path,
          status,
          body: request.body,
          model: this.config.openAiModel,
          ...(taskSpecResult.response.usage ? { usage: taskSpecResult.response.usage } : {})
        });
        return { status, body: HostedPlannerTaskSpecResponseSchema.parse(response) };
      }
      if (method === "POST" && request.path === "/v1/planner/review") {
        this.ensurePlannerPayloadAllowed(request.body);
        const planner = this.requirePlannerTransport();
        const reviewResult = await this.createReview(planner, request.body);
        status = 200;
        const response: HostedPlannerReviewResponse = {
          ...reviewResult.review,
          requestId,
          createdAt: now(),
          metadata: {
            model: this.config.openAiModel,
            responseId: reviewResult.response.responseId,
            repaired: reviewResult.repaired
          }
        };
        this.recordUsage({
          userId,
          route: request.path,
          status,
          body: request.body,
          model: this.config.openAiModel,
          ...(reviewResult.response.usage ? { usage: reviewResult.response.usage } : {})
        });
        return { status, body: HostedPlannerReviewResponseSchema.parse(response) };
      }
      return { status, body: { error: "not_found", requestId } };
    } catch (error) {
      status = error instanceof CloudHttpError ? error.status : 500;
      return { status, body: { error: error instanceof Error ? error.message : String(error), requestId } };
    } finally {
      this.requestLogs.push({
        requestId,
        route,
        ...(userId ? { userId } : {}),
        status,
        timestamp: now()
      });
    }
  }

  private async createTaskSpec(
    planner: CloudPlannerTransport,
    body: unknown
  ): Promise<{ taskSpec: TaskSpec; response: CloudPlannerResponse; repaired: boolean }> {
    const first = await planner.createResponse({
      model: this.config.openAiModel,
      instructions: [
        PLANNER_SYSTEM_PROMPT,
        "Return only strict JSON matching this shape:",
        "{ title, goal, background, requirements, constraints, nonGoals, acceptanceCriteria, suggestedFiles, verificationSteps, expectedSummaryFormat }.",
        "requirements, constraints, nonGoals, acceptanceCriteria, suggestedFiles, and verificationSteps must be arrays of strings."
      ].join("\n"),
      input: renderPlannerTaskSpecPrompt(body),
      metadata: { route: "task-spec" }
    });
    const parsed = parseTaskSpec(first.outputText);
    if (parsed) {
      return { taskSpec: parsed, response: first, repaired: false };
    }

    const repair = await planner.createResponse({
      model: this.config.openAiModel,
      instructions: "Repair the invalid response into strict JSON for AgentBridge TaskSpec. Return JSON only.",
      input: [
        "The prior response did not validate.",
        "Invalid response:",
        first.outputText,
        "",
        "Original request payload:",
        safeJson(body)
      ].join("\n"),
      metadata: { route: "task-spec-repair" }
    });
    const repaired = parseTaskSpec(repair.outputText);
    if (!repaired) {
      throw new CloudHttpError(502, "hosted planner returned an invalid TaskSpec");
    }
    return { taskSpec: repaired, response: repair, repaired: true };
  }

  private async createReview(
    planner: CloudPlannerTransport,
    body: unknown
  ): Promise<{
    review: Pick<HostedPlannerReviewResponse, "reviewSummary" | "statusSuggestion" | "followUpTaskSpec">;
    response: CloudPlannerResponse;
    repaired: boolean;
  }> {
    const first = await planner.createResponse({
      model: this.config.openAiModel,
      instructions: [
        PLANNER_SYSTEM_PROMPT,
        "Review the verification result. Return strict JSON:",
        "{ reviewSummary, statusSuggestion, followUpTaskSpec? }.",
        "statusSuggestion must be one of: passed, needs_review, follow_up_needed."
      ].join("\n"),
      input: renderPlannerReviewPrompt(body),
      metadata: { route: "review" }
    });
    const parsed = parseReview(first.outputText);
    if (parsed) {
      return { review: parsed, response: first, repaired: false };
    }

    const repair = await planner.createResponse({
      model: this.config.openAiModel,
      instructions: "Repair the invalid review into strict JSON. Return JSON only.",
      input: ["Invalid review response:", first.outputText, "", "Original request payload:", safeJson(body)].join("\n"),
      metadata: { route: "review-repair" }
    });
    const repaired = parseReview(repair.outputText);
    if (!repaired) {
      throw new CloudHttpError(502, "hosted planner returned an invalid review");
    }
    return { review: repaired, response: repair, repaired: true };
  }

  private requireAuth(request: CloudRequest): { userId: string } {
    const token = bearerToken(request.headers);
    if (!token || !this.devTokens.has(token)) {
      throw new CloudHttpError(401, "unauthorized");
    }
    return { userId: DEV_USER.id };
  }

  private requirePlannerTransport(): CloudPlannerTransport {
    if (!this.plannerTransport) {
      throw new CloudHttpError(503, "hosted planner is unavailable because OPENAI_API_KEY is not configured on AgentBridge Cloud");
    }
    return this.plannerTransport;
  }

  private requireSession(userId: string, sessionId: string): PlannerSessionMetadata {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new CloudHttpError(404, "planner session not found");
    }
    return session;
  }

  private touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, updatedAt: now() });
    }
  }

  private ensurePlannerPayloadAllowed(body: unknown): void {
    const bytes = Buffer.byteLength(JSON.stringify(body ?? {}), "utf8");
    if (bytes > this.config.maxPlannerPayloadBytes) {
      throw new CloudHttpError(413, "planner payload is too large");
    }
    if (!this.config.allowFileUploads && containsFilePayload(body)) {
      throw new CloudHttpError(400, "planner file payloads are disabled");
    }
  }

  private recordUsage(input: {
    userId: string;
    route: string;
    status: number;
    body: unknown;
    model?: string;
    usage?: CloudPlannerUsage;
  }): void {
    this.usage.push({
      id: `usage_${randomUUID()}`,
      userId: input.userId,
      route: input.route,
      provider: input.model ? "openai" : "agentbridge",
      model: input.model ?? this.config.openAiModel,
      ...(input.usage?.inputTokens === undefined ? {} : { inputTokens: input.usage.inputTokens }),
      ...(input.usage?.outputTokens === undefined ? {} : { outputTokens: input.usage.outputTokens }),
      payloadBytes: Buffer.byteLength(JSON.stringify(input.body ?? {}), "utf8"),
      status: input.status,
      createdAt: now()
    });
  }
}

class OpenAIResponsesPlannerTransport implements CloudPlannerTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createResponse(request: CloudPlannerRequest): Promise<CloudPlannerResponse> {
    const createResponse = this.client.responses.create.bind(this.client.responses) as (
      body: Record<string, unknown>
    ) => Promise<unknown>;
    const response = await createResponse({
      model: request.model,
      instructions: request.instructions,
      input: request.input
    });
    const record = asRecord(response);
    const usage = asRecord(record.usage);
    return {
      responseId: typeof record.id === "string" ? record.id : `response_${randomUUID()}`,
      outputText: extractResponseText(response),
      usage: {
        ...(typeof usage.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
        ...(typeof usage.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {})
      },
      metadata: {
        rawStatus: typeof record.status === "string" ? record.status : undefined
      }
    };
  }
}

class DeterministicMockPlannerTransport implements CloudPlannerTransport {
  async createResponse(request: CloudPlannerRequest): Promise<CloudPlannerResponse> {
    const route = typeof request.metadata?.route === "string" ? request.metadata.route : "message";
    return {
      responseId: `mock_${randomUUID()}`,
      outputText: mockPlannerOutput(route),
      usage: {
        inputTokens: Math.ceil(request.input.length / 4),
        outputTokens: 200
      },
      metadata: {
        transport: "deterministic-mock",
        route
      }
    };
  }
}

export function createCloudApp(
  config: Partial<CloudConfig> = {},
  options: AgentBridgeCloudAppOptions = {}
): AgentBridgeCloudApp {
  const loaded = loadConfig();
  const merged: CloudConfig = {
    ...loaded,
    ...config,
    openAiApiKeyConfigured: Boolean(config.openAiApiKey ?? loaded.openAiApiKey)
  };
  return new AgentBridgeCloudApp(merged, options);
}

export async function startServer(app = createCloudApp()): Promise<void> {
  const server = createServer((request, response) => {
    void handleNodeRequest(app, request, response);
  });
  const port = loadConfig().port;
  server.listen(port, () => {
    console.log(`AgentBridge Cloud listening on ${port}`);
  });
}

async function handleNodeRequest(app: AgentBridgeCloudApp, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request);
  const result = await app.handle({
    method: request.method ?? "GET",
    path: request.url?.split("?")[0] ?? "/",
    headers: normalizeHeaders(request.headers),
    body
  });
  response.writeHead(result.status, { "content-type": "application/json" });
  response.end(JSON.stringify(result.body));
}

function loadConfig(): CloudConfig {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  return {
    port: Number(process.env.AGENTBRIDGE_CLOUD_PORT ?? 8787),
    ...(openAiApiKey ? { openAiApiKey } : {}),
    openAiApiKeyConfigured: Boolean(openAiApiKey),
    mockPlanner: process.env.AGENTBRIDGE_CLOUD_MOCK === "1" || process.env.AGENTBRIDGE_CLOUD_MOCK === "true",
    openAiModel: process.env.AGENTBRIDGE_CLOUD_OPENAI_MODEL ?? "gpt-4.1-mini",
    logRawPayloads: process.env.LOG_RAW_PAYLOADS === "true",
    maxPlannerPayloadBytes: Number(process.env.MAX_PLANNER_PAYLOAD_BYTES ?? 64 * 1024),
    allowFileUploads: process.env.AGENTBRIDGE_CLOUD_ALLOW_FILE_UPLOADS === "true"
  };
}

function mockPlannerOutput(route: string): string {
  if (route === "task-spec" || route === "task-spec-repair") {
    return JSON.stringify({
      title: "Completion contract evidence regression",
      goal: "Add regression coverage proving completion contracts cannot pass autonomously without required evidence.",
      background: "AgentBridge must avoid false autonomous pass states when visual, textual, command, or human-review evidence is missing.",
      instructions: [
        "Add focused regression tests for completion-contract evidence evaluation.",
        "Keep the change scoped to tests unless a minimal implementation fix is required."
      ],
      requirements: [
        "A required visual or textual criterion without evidence cannot pass.",
        "Human-review-only criteria result in needs_review, not passed.",
        "Existing build, test, and lint commands pass."
      ],
      constraints: [
        "Do not change provider routing.",
        "Do not change Codex delivery.",
        "Do not change hosted planner behavior.",
        "Do not change Workbench UI.",
        "Do not change store schema."
      ],
      nonGoals: [
        "Do not add new providers.",
        "Do not redesign Simple Mode."
      ],
      acceptanceCriteria: [
        "Regression tests fail if missing required evidence can produce autonomous passed.",
        "Regression tests cover human-review-only criteria returning needs_review.",
        "pnpm test, pnpm build, and pnpm lint pass."
      ],
      suggestedFiles: [
        "packages/core/tests/completion-contracts.test.ts",
        "apps/desktop/tests/autopilot-service.test.ts"
      ],
      verificationSteps: [
        "pnpm test",
        "pnpm build",
        "pnpm lint"
      ],
      expectedSummaryFormat: "Summary, tests added, verification commands, and remaining risks."
    });
  }
  if (route === "review" || route === "review-repair") {
    return JSON.stringify({
      reviewSummary: "Mock planner review: inspect verification evidence and do not mark passed unless command results and completion evidence support it.",
      statusSuggestion: "needs_review"
    });
  }
  return [
    "Plan: add focused regression coverage for completion-contract evidence handling.",
    "Keep the change scoped. Verify with pnpm test, pnpm build, and pnpm lint."
  ].join("\n");
}

function renderPlannerMessagePrompt(body: unknown): string {
  return ["Desktop planner message payload:", safeJson(body)].join("\n");
}

function renderPlannerTaskSpecPrompt(body: unknown): string {
  return [
    "Create an AgentBridge TaskSpec from this minimized desktop payload.",
    "Do not invent source files that were not provided; suggestedFiles may be empty.",
    safeJson(body)
  ].join("\n\n");
}

function renderPlannerReviewPrompt(body: unknown): string {
  return [
    "Review this AgentBridge verification payload.",
    "If verification is insufficient, choose needs_review unless a focused follow-up TaskSpec is clearly useful.",
    safeJson(body)
  ].join("\n\n");
}

function parseTaskSpec(content: string): TaskSpec | undefined {
  const candidates = jsonCandidates(content);
  for (const candidate of candidates) {
    try {
      const result = TaskSpecSchema.safeParse(JSON.parse(candidate) as unknown);
      if (result.success) {
        return result.data;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function parseReview(
  content: string
): Pick<HostedPlannerReviewResponse, "reviewSummary" | "statusSuggestion" | "followUpTaskSpec"> | undefined {
  for (const candidate of jsonCandidates(content)) {
    try {
      const record = asRecord(JSON.parse(candidate) as unknown);
      const reviewSummary = typeof record.reviewSummary === "string" ? record.reviewSummary : undefined;
      const statusSuggestion =
        record.statusSuggestion === "passed" ||
        record.statusSuggestion === "needs_review" ||
        record.statusSuggestion === "follow_up_needed"
          ? record.statusSuggestion
          : undefined;
      if (!reviewSummary || !statusSuggestion) {
        continue;
      }
      const followUpResult = record.followUpTaskSpec === undefined ? undefined : TaskSpecSchema.safeParse(record.followUpTaskSpec);
      if (followUpResult && !followUpResult.success) {
        continue;
      }
      return {
        reviewSummary,
        statusSuggestion,
        ...(followUpResult?.success ? { followUpTaskSpec: followUpResult.data } : {})
      };
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function jsonCandidates(content: string): string[] {
  const block = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  return [content.trim(), block].filter((candidate): candidate is string => Boolean(candidate));
}

function extractResponseText(response: unknown): string {
  const record = asRecord(response);
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);
      if (typeof contentRecord.text === "string") {
        chunks.push(contentRecord.text);
      }
      if (typeof contentRecord.output_text === "string") {
        chunks.push(contentRecord.output_text);
      }
    }
  }
  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error("OpenAI planner response did not contain text output.");
  }
  return text;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function bearerToken(headers: CloudRequest["headers"]): string | undefined {
  const value = headers?.authorization ?? headers?.Authorization;
  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }
  return value.slice("Bearer ".length);
}

function normalizeHeaders(headers: IncomingMessage["headers"]): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function containsFilePayload(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsFilePayload);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    const normalized = key.toLowerCase();
    if (
      normalized === "filedata" ||
      normalized === "file_data" ||
      normalized === "filecontent" ||
      normalized === "contentbytes" ||
      normalized === "bytes" ||
      normalized === "dataurl"
    ) {
      return true;
    }
    if (containsFilePayload(nested)) {
      return true;
    }
  }
  return false;
}

function now(): string {
  return new Date().toISOString();
}

class CloudHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startServer();
}
