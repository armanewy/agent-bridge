import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import type {
  AgentProviderProfile,
  AgentSessionRef,
  AgentTurn,
  Artifact,
  ArtifactFile,
  OpenAIUploadedFileRef,
  PlannerProvider,
  PlannerRequest,
  PlannerResponse,
  ReviewRequest,
  ReviewResult,
  TaskSpec
} from "@agentbridge/core";
import { PlannerRequestSchema, ReviewRequestSchema, TaskSpecSchema } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { ArtifactBrokerService } from "../artifact-broker-service.js";

export const OPENAI_PLANNER_PROVIDER_ID = "openai-planner";

const SYSTEM_PROMPT =
  "You are AgentBridge Planner. Produce coding direction, acceptance criteria, constraints, and review feedback. Prefer scoped, verifiable tasks.";

export interface OpenAIPlannerResponseRequest {
  model: string;
  instructions: string;
  input: string;
  fileInputs?: OpenAIPlannerFileInput[];
  previousResponseId?: string;
}

export interface OpenAIPlannerResponsePayload {
  responseId: string;
  outputText: string;
  metadata?: Record<string, unknown>;
}

export interface OpenAIPlannerFileInput {
  type: "input_file";
  file_id: string;
}

export interface OpenAIPlannerUploadFileRequest {
  localPath: string;
  fileName: string;
  mimeType?: string;
  purpose: "user_data";
  sha256: string;
}

export interface OpenAIPlannerUploadFileResponse {
  openaiFileId: string;
  purpose: string;
  expiresAt?: string;
}

export interface OpenAIPlannerTransport {
  createResponse(request: OpenAIPlannerResponseRequest): Promise<OpenAIPlannerResponsePayload>;
  uploadFile?(request: OpenAIPlannerUploadFileRequest): Promise<OpenAIPlannerUploadFileResponse>;
}

export interface OpenAIPlannerProviderOptions {
  apiKey?: string;
  model?: string;
  transport?: OpenAIPlannerTransport;
  artifactBroker?: ArtifactBrokerService;
  maxInlineFileBytes?: number;
  allowFileUploads?: boolean;
  now?: () => string;
}

export class OpenAIPlannerProvider implements PlannerProvider {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly transport: OpenAIPlannerTransport | undefined;
  private readonly artifactBroker: ArtifactBrokerService | undefined;
  private readonly maxInlineFileBytes: number;
  private readonly allowFileUploads: boolean;
  private readonly now: () => string;

  constructor(private readonly store: LocalStore, options: OpenAIPlannerProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.AGENTBRIDGE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.AGENTBRIDGE_OPENAI_PLANNER_MODEL ?? "gpt-4.1-mini";
    this.transport = options.transport;
    this.artifactBroker = options.artifactBroker;
    this.maxInlineFileBytes = options.maxInlineFileBytes ?? 64 * 1024;
    this.allowFileUploads = options.allowFileUploads ?? false;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  profile(): AgentProviderProfile {
    return {
      id: OPENAI_PLANNER_PROVIDER_ID,
      kind: "planner",
      displayName: "OpenAI Planner",
      capabilities: ["canPlan", "canReview", "canCreateSession", "canResumeSession", "canSendMessage", "canReadResult"],
      authMode: "apiKey",
      status: this.hasTransport() ? "available" : "needsAuth",
      artifactCapabilities: {
        canAcceptTextArtifacts: true,
        canAcceptFileInputs: false,
        canAcceptFilePaths: false,
        canReturnTextArtifacts: true,
        canReturnFileArtifacts: false,
        canReturnDiffs: false,
        canReturnLogs: false,
        canReturnScreenshots: false,
        acceptedMimeTypes: ["text/plain", "text/markdown", "application/json"]
      },
      metadata: {
        model: this.model,
        systemPromptVersion: "agentbridge-planner-v1",
        apiKeySource: this.apiKeySource()
      }
    };
  }

  async status(): Promise<AgentProviderProfile> {
    return this.profile();
  }

  async createSession(input: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {}): Promise<AgentSessionRef> {
    const now = this.now();
    const id = `planner_session_${randomUUID()}`;
    const session: AgentSessionRef = {
      id,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      providerKind: "planner",
      externalSessionId: id,
      status: "active",
      createdAt: now,
      lastSeenAt: now,
      metadata: {
        model: this.model,
        ...input.metadata
      },
      ...(input.title ? { title: input.title } : {}),
      ...(input.repoPath ? { repoPath: input.repoPath } : {})
    };
    await this.store.saveAgentSession(session);
    await this.store.appendAgentEvent({
      id: `agent_event_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      type: "session.created",
      payload: { title: session.title, repoPath: session.repoPath },
      createdAt: now
    });
    return session;
  }

  async resumeSession(sessionRef: AgentSessionRef): Promise<AgentSessionRef> {
    const resumed: AgentSessionRef = {
      ...sessionRef,
      status: "active",
      lastSeenAt: this.now()
    };
    await this.store.saveAgentSession(resumed);
    return resumed;
  }

  async sendMessage(sessionRef: AgentSessionRef, message: string, context?: PlannerRequest): Promise<AgentTurn> {
    return (await this.createPlannerTurn(sessionRef, message, context)).assistantTurn;
  }

  async plan(input: PlannerRequest): Promise<PlannerResponse> {
    const request = PlannerRequestSchema.parse(input);
    const sessionFallback: { title?: string; repoPath?: string; metadata?: Record<string, unknown> } = {
      title: "Planner thread",
      metadata: request.metadata
    };
    if (request.repoContext?.repoPath) {
      sessionFallback.repoPath = request.repoContext.repoPath;
    }
    const session = await this.resolvePlannerSession(request.sessionRefId, sessionFallback);
    const { assistantTurn, taskSpec } = await this.createPlannerTurn(session, request.prompt, request);
    return {
      id: `planner_response_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      turnId: assistantTurn.id,
      content: assistantTurn.content,
      artifactIds: assistantTurn.artifactIds,
      createdAt: assistantTurn.completedAt ?? assistantTurn.createdAt,
      metadata: {
        model: this.model,
        responseId: assistantTurn.externalTurnId,
        ...assistantTurn.metadata
      },
      ...(taskSpec ? { taskSpec } : {})
    };
  }

  async review(input: ReviewRequest): Promise<ReviewResult> {
    const request = ReviewRequestSchema.parse(input);
    const session = await this.resolvePlannerSession(request.sessionRefId, {
      title: "Planner review thread",
      metadata: request.metadata
    });
    const prompt = renderReviewPrompt(request);
    const { assistantTurn, taskSpec } = await this.createPlannerTurn(session, prompt, {
      missionId: request.missionId,
      prompt,
      contextArtifactIds: request.artifactIds,
      metadata: {
        source: "review",
        ...request.metadata
      }
    });
    return {
      id: `review_result_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: session.id,
      turnId: assistantTurn.id,
      content: assistantTurn.content,
      statusSuggestion: inferReviewStatus(assistantTurn.content),
      artifactIds: assistantTurn.artifactIds,
      createdAt: assistantTurn.completedAt ?? assistantTurn.createdAt,
      metadata: {
        model: this.model,
        responseId: assistantTurn.externalTurnId,
        ...assistantTurn.metadata
      },
      ...(taskSpec ? { followUpTaskSpec: taskSpec } : {})
    };
  }

  async prepareArtifactsForInput(
    request: PlannerRequest | ReviewRequest,
    _context: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const fileIds = await this.resolveRequestFileIds(request);
    const inlineFileTexts: Array<{ fileId: string; fileName: string; content: string }> = [];
    const fileSummaries: string[] = [];
    const uploadedFiles: OpenAIUploadedFileRef[] = [];
    const fileInputs: OpenAIPlannerFileInput[] = [];
    const transport = this.transport;

    for (const fileId of fileIds) {
      const file = await this.store.getArtifactFile(fileId);
      if (!file) {
        fileSummaries.push(`- ${fileId}: missing local file metadata`);
        continue;
      }

      const summary = `${file.fileName} (${file.classification}, ${file.sizeBytes} bytes, sha256 ${file.sha256})`;
      if (isTextLikeFile(file) && file.sizeBytes <= this.maxInlineFileBytes) {
        const content = await readFile(file.localPath, "utf8");
        inlineFileTexts.push({ fileId: file.id, fileName: file.fileName, content });
        fileSummaries.push(`- ${summary}: included inline`);
        continue;
      }

      if (this.allowFileUploads && transport?.uploadFile && isProviderUploadCandidate(file)) {
        const existing = await this.store.getOpenAIUploadedFileRef(file.id);
        const uploaded =
          existing && existing.sha256 === file.sha256
            ? existing
            : await this.uploadOpenAIFile(file, transport);
        uploadedFiles.push(uploaded);
        fileInputs.push({ type: "input_file", file_id: uploaded.openaiFileId });
        fileSummaries.push(`- ${summary}: uploaded to OpenAI file ${uploaded.openaiFileId}`);
        continue;
      }

      fileSummaries.push(`- ${summary}: summarized only`);
    }

    return {
      fileIds,
      fileSummaries,
      inlineFileTexts,
      uploadedFiles,
      fileInputs
    };
  }

  private async resolvePlannerSession(
    sessionRefId: string | undefined,
    fallback: { title?: string; repoPath?: string; metadata?: Record<string, unknown> }
  ): Promise<AgentSessionRef> {
    if (!sessionRefId) {
      return this.createSession(fallback);
    }
    const session = await this.store.getAgentSession(sessionRefId);
    if (!session) {
      throw new Error(`Planner session ${sessionRefId} was not found.`);
    }
    return session;
  }

  private async createPlannerTurn(
    sessionRef: AgentSessionRef,
    message: string,
    context?: PlannerRequest
  ): Promise<{ assistantTurn: AgentTurn; taskSpec?: TaskSpec }> {
    const transport = this.resolveTransport();
    const createdAt = this.now();
    const userArtifactIds = await this.savePromptArtifacts(context?.missionId, message, context);
    const userTurn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: sessionRef.id,
      role: "user",
      content: message,
      status: "completed",
      artifactIds: userArtifactIds,
      createdAt,
      completedAt: createdAt,
      metadata: {
        source: context?.metadata?.source ?? "plannerUserMessage"
      }
    };
    await this.store.saveAgentTurn(userTurn);

    const responseRequest: OpenAIPlannerResponseRequest = {
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: renderPlannerInput(message, context)
    };
    if (context && hasArtifactInputs(context)) {
      const preparedArtifacts = await this.prepareArtifactsForInput(context);
      responseRequest.input = renderPlannerInput(message, context, preparedArtifacts);
      const fileInputs = preparedArtifacts.fileInputs;
      if (Array.isArray(fileInputs) && fileInputs.length) {
        responseRequest.fileInputs = fileInputs as OpenAIPlannerFileInput[];
      }
    }
    const previousResponseId = stringFromMetadata(sessionRef.metadata.previousResponseId);
    if (previousResponseId) {
      responseRequest.previousResponseId = previousResponseId;
    }
    const response = await transport.createResponse(responseRequest);
    const completedAt = this.now();
    const taskSpec = parseTaskSpec(response.outputText);
    const responseArtifactIds = await this.saveResponseArtifacts(context?.missionId, response.outputText, {
      responseId: response.responseId,
      model: this.model,
      taskSpecParsed: Boolean(taskSpec),
      ...(context?.metadata?.source ? { source: context.metadata.source } : {}),
      ...(response.metadata ?? {})
    });
    const generatedFileIds = await this.saveGeneratedFileBlocks(context?.missionId, response.outputText, response.responseId);
    const assistantTurn: AgentTurn = {
      id: `agent_turn_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: sessionRef.id,
      externalTurnId: response.responseId,
      role: "assistant",
      content: response.outputText,
      status: "completed",
      artifactIds: [...responseArtifactIds, ...generatedFileIds],
      createdAt,
      completedAt,
      metadata: {
        model: this.model,
        taskSpecParsed: Boolean(taskSpec),
        ...(context?.metadata?.source ? { source: context.metadata.source } : {}),
        ...(response.metadata ?? {})
      }
    };
    await this.store.saveAgentTurn(assistantTurn);
    await this.store.saveAgentSession({
      ...sessionRef,
      status: "active",
      lastSeenAt: completedAt,
      metadata: {
        ...sessionRef.metadata,
        previousResponseId: response.responseId,
        model: this.model
      }
    });
    await this.store.appendAgentEvent({
      id: `agent_event_${randomUUID()}`,
      providerId: OPENAI_PLANNER_PROVIDER_ID,
      sessionRefId: sessionRef.id,
      turnId: assistantTurn.id,
      type: "turn.completed",
      payload: {
        responseId: response.responseId,
        model: this.model,
        taskSpecParsed: Boolean(taskSpec)
      },
      createdAt: completedAt
    });
    return {
      assistantTurn: {
        ...assistantTurn,
        artifactIds: [...responseArtifactIds, ...generatedFileIds]
      },
      ...(taskSpec ? { taskSpec } : {})
    };
  }

  private async resolveRequestFileIds(request: PlannerRequest | ReviewRequest): Promise<string[]> {
    const directFileIds = Array.isArray(request.fileIds) ? request.fileIds : [];
    const bundleIds = Array.isArray(request.artifactBundleIds) ? request.artifactBundleIds : [];
    const bundleFileIds: string[] = [];
    for (const bundleId of bundleIds) {
      const bundle = await this.store.getArtifactBundle(bundleId);
      if (bundle) {
        bundleFileIds.push(...bundle.fileIds);
      }
    }
    return [...new Set([...directFileIds, ...bundleFileIds])];
  }

  private async uploadOpenAIFile(file: ArtifactFile, transport: OpenAIPlannerTransport): Promise<OpenAIUploadedFileRef> {
    if (!transport.uploadFile) {
      throw new Error("OpenAI Planner transport does not support file uploads.");
    }
    const uploaded = await transport.uploadFile({
      localPath: file.localPath,
      fileName: file.fileName,
      purpose: "user_data",
      sha256: file.sha256,
      ...(file.mimeType ? { mimeType: file.mimeType } : {})
    });
    const ref: OpenAIUploadedFileRef = {
      localFileId: file.id,
      openaiFileId: uploaded.openaiFileId,
      uploadedAt: this.now(),
      purpose: uploaded.purpose,
      sha256: file.sha256,
      ...(uploaded.expiresAt ? { expiresAt: uploaded.expiresAt } : {})
    };
    await this.store.saveOpenAIUploadedFileRef(ref);
    return ref;
  }

  private async savePromptArtifacts(
    missionId: string | undefined,
    message: string,
    context?: PlannerRequest
  ): Promise<string[]> {
    if (!missionId) {
      return [];
    }
    const artifact = textArtifact({
      missionId,
      kind: "reviewNote",
      title: "Planner user message",
      content: message,
      metadata: {
        providerId: OPENAI_PLANNER_PROVIDER_ID,
        contextArtifactIds: context?.contextArtifactIds ?? [],
        requestMetadata: context?.metadata ?? {}
      },
      createdAt: this.now()
    });
    await this.store.saveArtifact(artifact);
    return [artifact.id];
  }

  private async saveResponseArtifacts(
    missionId: string | undefined,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<string[]> {
    if (!missionId) {
      return [];
    }
    const artifact = textArtifact({
      missionId,
      kind: "modelResponse",
      title: "Planner response",
      content,
      metadata: {
        providerId: OPENAI_PLANNER_PROVIDER_ID,
        ...metadata
      },
      createdAt: this.now()
    });
    await this.store.saveArtifact(artifact);
    return [artifact.id];
  }

  private async saveGeneratedFileBlocks(missionId: string | undefined, content: string, responseId: string): Promise<string[]> {
    if (!missionId || !this.artifactBroker) {
      return [];
    }
    const fileBlocks = extractFileBlocks(content);
    const fileIds: string[] = [];
    for (const fileBlock of fileBlocks) {
      const file = await this.artifactBroker.importGeneratedTextAsFile(missionId, fileBlock.fileName, fileBlock.content, {
        providerId: OPENAI_PLANNER_PROVIDER_ID,
        sourceTurnId: responseId,
        artifactTitle: `Planner generated file: ${fileBlock.fileName}`,
        classification: "generatedAsset"
      });
      fileIds.push(file.artifactId);
    }
    return fileIds;
  }

  private hasTransport(): boolean {
    return Boolean(this.transport || this.apiKey);
  }

  private resolveTransport(): OpenAIPlannerTransport {
    if (this.transport) {
      return this.transport;
    }
    if (!this.apiKey) {
      throw new Error("OpenAI Planner needs AGENTBRIDGE_OPENAI_API_KEY or OPENAI_API_KEY.");
    }
    return new OpenAISdkPlannerTransport(this.apiKey);
  }

  private apiKeySource(): "agentbridgeEnv" | "openaiEnv" | "injected" | "missing" {
    if (this.apiKey && this.apiKey !== process.env.AGENTBRIDGE_OPENAI_API_KEY && this.apiKey !== process.env.OPENAI_API_KEY) {
      return "injected";
    }
    if (process.env.AGENTBRIDGE_OPENAI_API_KEY) {
      return "agentbridgeEnv";
    }
    if (process.env.OPENAI_API_KEY) {
      return "openaiEnv";
    }
    return "missing";
  }
}

class OpenAISdkPlannerTransport implements OpenAIPlannerTransport {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createResponse(request: OpenAIPlannerResponseRequest): Promise<OpenAIPlannerResponsePayload> {
    const input: unknown = request.fileInputs?.length
      ? [
          {
            role: "user",
            content: [
              { type: "input_text", text: request.input },
              ...request.fileInputs
            ]
          }
        ]
      : request.input;
    const payload: Record<string, unknown> = {
      model: request.model,
      instructions: request.instructions,
      input
    };
    if (request.previousResponseId) {
      payload.previous_response_id = request.previousResponseId;
    }
    const createResponse = this.client.responses.create.bind(this.client.responses) as (
      body: Record<string, unknown>
    ) => Promise<unknown>;
    const response = await createResponse(payload);
    const outputText = extractResponseText(response);
    return {
      responseId: extractResponseId(response),
      outputText,
      metadata: {
        rawStatus: stringFromRecord(response, "status")
      }
    };
  }

  async uploadFile(request: OpenAIPlannerUploadFileRequest): Promise<OpenAIPlannerUploadFileResponse> {
    const createFile = this.client.files.create.bind(this.client.files) as unknown as (
      body: Record<string, unknown>
    ) => Promise<unknown>;
    const response = await createFile({
      file: createReadStream(request.localPath),
      purpose: request.purpose
    });
    const record = asRecord(response);
    const openaiFileId = typeof record.id === "string" ? record.id : undefined;
    if (!openaiFileId) {
      throw new Error(`OpenAI file upload for ${request.fileName} did not return a file id.`);
    }
    return {
      openaiFileId,
      purpose: typeof record.purpose === "string" ? record.purpose : request.purpose
    };
  }
}

function renderPlannerInput(message: string, context?: PlannerRequest, preparedArtifacts?: Record<string, unknown>): string {
  const sections = [message.trim()];
  if (context?.repoContext) {
    const repo = context.repoContext;
    sections.push(
      [
        "Repo context:",
        `- Path: ${repo.repoPath}`,
        repo.repoName ? `- Name: ${repo.repoName}` : undefined,
        repo.currentBranch ? `- Branch: ${repo.currentBranch}` : undefined,
        repo.gitStatusSummary ? `- Git status: ${repo.gitStatusSummary}` : undefined,
        repo.testCommand ? `- Test: ${repo.testCommand}` : undefined,
        repo.lintCommand ? `- Lint: ${repo.lintCommand}` : undefined,
        repo.typecheckCommand ? `- Typecheck: ${repo.typecheckCommand}` : undefined
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    );
  }
  if (context?.contextArtifactIds?.length) {
    sections.push(`Context artifact IDs: ${context.contextArtifactIds.join(", ")}`);
  }
  const fileSummaries = Array.isArray(preparedArtifacts?.fileSummaries) ? preparedArtifacts.fileSummaries : [];
  if (fileSummaries.length) {
    sections.push(["Attached file summaries:", ...fileSummaries.map(String)].join("\n"));
  }
  const inlineFileTexts = Array.isArray(preparedArtifacts?.inlineFileTexts) ? preparedArtifacts.inlineFileTexts : [];
  for (const value of inlineFileTexts) {
    const inline = asRecord(value);
    if (typeof inline.fileName === "string" && typeof inline.content === "string") {
      sections.push([`Inline file: ${inline.fileName}`, "```", inline.content, "```"].join("\n"));
    }
  }
  return sections.join("\n\n");
}

function renderReviewPrompt(request: ReviewRequest): string {
  const criteria = request.taskSpec.acceptanceCriteria.map((item) => `- ${item}`).join("\n") || "- Not specified";
  const verification = request.verificationSummary ?? request.verificationResult?.summary ?? "No verification summary was provided.";
  return [
    "Review this AgentBridge task result.",
    "",
    `Task: ${request.taskSpec.title}`,
    `Goal: ${request.taskSpec.goal}`,
    "",
    "Acceptance criteria:",
    criteria,
    "",
    "Verification:",
    verification,
    "",
    "Return a concise review. Say whether this is passed, needs review, or needs a follow-up. If a follow-up is needed, keep it scoped to fixing the failure."
  ].join("\n");
}

function inferReviewStatus(content: string): ReviewResult["statusSuggestion"] {
  const lower = content.toLowerCase();
  if (lower.includes("follow-up") || lower.includes("follow up") || lower.includes("fix")) {
    return "follow_up_needed";
  }
  if (lower.includes("pass") && !lower.includes("fail")) {
    return "passed";
  }
  return "needs_review";
}

function parseTaskSpec(content: string): TaskSpec | undefined {
  const candidates = [content, extractJsonBlock(content)].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const result = TaskSpecSchema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
    } catch {
      // Not structured JSON; the planner response is still stored as plain text.
    }
  }
  return undefined;
}

function extractJsonBlock(content: string): string | undefined {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function extractFileBlocks(content: string): Array<{ fileName: string; content: string }> {
  const blocks: Array<{ fileName: string; content: string }> = [];
  const pattern = /```file:([^\n\r]+)\r?\n([\s\S]*?)```/g;
  for (const match of content.matchAll(pattern)) {
    const fileName = match[1]?.trim();
    const fileContent = match[2] ?? "";
    if (fileName) {
      blocks.push({ fileName, content: fileContent.replace(/\s+$/, "") });
    }
  }
  return blocks;
}

function hasArtifactInputs(context: PlannerRequest): boolean {
  return Boolean(
    context.includeFileSummaries ||
      context.fileIds?.length ||
      context.artifactBundleIds?.length
  );
}

function isTextLikeFile(file: ArtifactFile): boolean {
  if (file.mimeType?.startsWith("text/")) {
    return true;
  }
  return [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css", ".html", ".py", ".cs", ".yml", ".yaml"].some((suffix) =>
    file.fileName.toLowerCase().endsWith(suffix)
  );
}

function isProviderUploadCandidate(file: ArtifactFile): boolean {
  return Boolean(file.mimeType?.startsWith("text/") || file.classification === "document" || file.classification === "sourceCode");
}

function textArtifact(input: Omit<Artifact, "id">): Artifact {
  return {
    id: `artifact_${randomUUID()}`,
    ...input
  };
}

function extractResponseId(response: unknown): string {
  const record = asRecord(response);
  return typeof record.id === "string" ? record.id : `response_${randomUUID()}`;
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
    throw new Error("OpenAI Planner response did not contain text output.");
  }
  return text;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringFromRecord(value: unknown, key: string): string | undefined {
  const candidate = asRecord(value)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function stringFromMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
