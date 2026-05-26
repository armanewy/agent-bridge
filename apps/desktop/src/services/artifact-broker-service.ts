import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { Artifact, ArtifactBundle, ArtifactFile, ArtifactFileClassification } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import { PlatformService } from "./platform-service.js";

export interface StoreProviderFileInput {
  missionId: string;
  providerId?: string;
  sourceTurnId?: string;
  fileName: string;
  content: string | Buffer;
  artifactTitle?: string;
  classification?: ArtifactFileClassification;
  mimeType?: string;
}

export interface StagedArtifactFile {
  fileId: string;
  fileName: string;
  localPath: string;
  stagedPath: string;
  relativePath: string;
  purpose?: string;
  sha256: string;
  sizeBytes: number;
  classification: ArtifactFileClassification;
}

export interface FileRiskFinding {
  kind: "secret" | "binary" | "blockedExtension" | "blockedPattern" | "largeFile" | "pathTraversal" | "script";
  severity: "low" | "medium" | "high";
  message: string;
}

export interface FileRiskPolicy {
  maxProviderUploadBytes?: number;
  allowedFileExtensions?: string[];
  blockedFilePatterns?: string[];
  requireApprovalForBinaryFiles?: boolean;
}

export class ArtifactBrokerService {
  constructor(
    private readonly store: LocalStore,
    private readonly platformService = new PlatformService(),
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async importLocalFile(missionId: string, filePath: string, options: { artifactTitle?: string; classification?: ArtifactFileClassification } = {}): Promise<ArtifactFile> {
    const bytes = await readFile(filePath);
    return this.storeProviderFile({
      missionId,
      fileName: basename(filePath),
      content: bytes,
      artifactTitle: options.artifactTitle ?? `Imported file: ${basename(filePath)}`,
      ...(options.classification ? { classification: options.classification } : {})
    });
  }

  async importGeneratedTextAsFile(
    missionId: string,
    fileName: string,
    content: string,
    options: { providerId?: string; sourceTurnId?: string; artifactTitle?: string; classification?: ArtifactFileClassification } = {}
  ): Promise<ArtifactFile> {
    return this.storeProviderFile({
      missionId,
      fileName,
      content,
      artifactTitle: options.artifactTitle ?? `Generated file: ${fileName}`,
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.sourceTurnId ? { sourceTurnId: options.sourceTurnId } : {}),
      ...(options.classification ? { classification: options.classification } : {})
    });
  }

  async storeProviderFile(input: StoreProviderFileInput): Promise<ArtifactFile> {
    const createdAt = this.now();
    const fileId = `file_${randomUUID()}`;
    const fileName = sanitizeFileName(input.fileName);
    const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
    const artifact: Artifact = {
      id: `artifact_${randomUUID()}`,
      missionId: input.missionId,
      kind: "fileReference",
      title: input.artifactTitle ?? fileName,
      metadata: {
        fileName,
        providerId: input.providerId,
        sourceTurnId: input.sourceTurnId
      },
      createdAt
    };
    await this.store.saveArtifact(artifact);

    const localPath = this.fileStoragePath(input.missionId, fileId, fileName);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, content);
    const savedStat = await stat(localPath);
    const file: ArtifactFile = {
      id: fileId,
      artifactId: artifact.id,
      missionId: input.missionId,
      fileName,
      localPath,
      relativePath: fileName,
      mimeType: input.mimeType ?? inferMimeType(fileName),
      sizeBytes: savedStat.size,
      sha256: computeSha256(content),
      ...(input.providerId ? { createdByProviderId: input.providerId } : {}),
      ...(input.sourceTurnId ? { sourceTurnId: input.sourceTurnId } : {}),
      classification: input.classification ?? classifyFile(fileName),
      createdAt
    };
    await this.store.saveArtifactFile(file);
    return file;
  }

  async createBundle(
    missionId: string,
    name: string,
    artifactIds: string[],
    fileIds: string[],
    purpose: ArtifactBundle["purpose"]
  ): Promise<ArtifactBundle> {
    const bundle: ArtifactBundle = {
      id: `bundle_${randomUUID()}`,
      missionId,
      name,
      artifactIds,
      fileIds,
      purpose,
      createdAt: this.now()
    };
    await this.store.saveArtifactBundle(bundle);
    return bundle;
  }

  listMissionFiles(missionId: string): Promise<ArtifactFile[]> {
    return this.store.listArtifactFilesForMission(missionId);
  }

  async getFileContent(fileId: string): Promise<Buffer> {
    const file = await this.store.getArtifactFile(fileId);
    if (!file) {
      throw new Error(`Artifact file ${fileId} was not found.`);
    }
    enforceArtifactStorageRoot(file.localPath, this.platformService.getArtifactRoot());
    return readFile(file.localPath);
  }

  async stageFilesForMission(missionId: string, fileIds: string[], purpose?: string): Promise<StagedArtifactFile[]> {
    const staged: StagedArtifactFile[] = [];
    const seenNames = new Set<string>();
    for (const fileId of fileIds) {
      const file = await this.store.getArtifactFile(fileId);
      if (!file) {
        throw new Error(`Artifact file ${fileId} was not found.`);
      }
      enforceArtifactStorageRoot(file.localPath, this.platformService.getArtifactRoot());
      const stagedFileName = uniqueFileName(sanitizeFileName(file.fileName), seenNames);
      const relativePath = join(file.id, stagedFileName);
      const stagedPath = resolve(this.platformService.getStagingRoot(), missionId, relativePath);
      await mkdir(dirname(stagedPath), { recursive: true });
      await copyFile(file.localPath, stagedPath);
      staged.push({
        fileId: file.id,
        fileName: file.fileName,
        localPath: file.localPath,
        stagedPath,
        relativePath,
        ...(purpose ? { purpose } : {}),
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        classification: file.classification
      });
    }
    return staged;
  }

  async scanFileRisk(fileId: string, policy: FileRiskPolicy = {}): Promise<FileRiskFinding[]> {
    const file = await this.store.getArtifactFile(fileId);
    if (!file) {
      throw new Error(`Artifact file ${fileId} was not found.`);
    }
    const findings: FileRiskFinding[] = [];
    try {
      enforceArtifactStorageRoot(file.localPath, this.platformService.getArtifactRoot());
    } catch {
      findings.push({ kind: "pathTraversal", severity: "high", message: "File path escapes the AgentBridge artifact root." });
      return findings;
    }

    const extension = extname(file.fileName).toLowerCase();
    if (policy.allowedFileExtensions?.length && !policy.allowedFileExtensions.map((item) => item.toLowerCase()).includes(extension)) {
      findings.push({ kind: "blockedExtension", severity: "medium", message: `${extension || "extensionless file"} is not in the allowed upload list.` });
    }
    for (const pattern of policy.blockedFilePatterns ?? []) {
      if (new RegExp(pattern, "i").test(file.fileName)) {
        findings.push({ kind: "blockedPattern", severity: "high", message: `${file.fileName} matches blocked pattern ${pattern}.` });
      }
    }
    if (policy.maxProviderUploadBytes && file.sizeBytes > policy.maxProviderUploadBytes) {
      findings.push({ kind: "largeFile", severity: "medium", message: `${file.fileName} exceeds the provider upload size limit.` });
    }
    if (policy.requireApprovalForBinaryFiles && !isTextMime(file.mimeType)) {
      findings.push({ kind: "binary", severity: "medium", message: `${file.fileName} is binary or has unknown text safety.` });
    }
    if ([".ps1", ".bat", ".cmd", ".sh", ".exe", ".dll", ".app"].includes(extension)) {
      findings.push({ kind: "script", severity: "high", message: `${file.fileName} is executable or script-like.` });
    }

    if (isTextMime(file.mimeType) && file.sizeBytes <= 1024 * 1024) {
      const content = await readFile(file.localPath, "utf8");
      if (/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/.test(content)) {
        findings.push({ kind: "secret", severity: "high", message: "Private key material detected." });
      }
      if (/^\s*[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*.+$/im.test(content)) {
        findings.push({ kind: "secret", severity: "high", message: "Environment-style secret detected." });
      }
      if (/[A-Za-z0-9+/=_-]{48,}/.test(content)) {
        findings.push({ kind: "secret", severity: "medium", message: "High-entropy token-like text detected." });
      }
    }
    return findings;
  }

  computeSha256(content: string | Buffer): string {
    return computeSha256(Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"));
  }

  inferMimeType(fileName: string): string {
    return inferMimeType(fileName);
  }

  classifyFile(fileName: string): ArtifactFileClassification {
    return classifyFile(fileName);
  }

  sanitizeFileName(fileName: string): string {
    return sanitizeFileName(fileName);
  }

  enforceArtifactStorageRoot(localPath: string): void {
    enforceArtifactStorageRoot(localPath, this.platformService.getArtifactRoot());
  }

  private fileStoragePath(missionId: string, fileId: string, fileName: string): string {
    const artifactRoot = this.platformService.getArtifactRoot();
    const storagePath = join(artifactRoot, missionId, fileId, fileName);
    enforceArtifactStorageRoot(storagePath, artifactRoot);
    return storagePath;
  }
}

function sanitizeFileName(fileName: string): string {
  const safe = basename(fileName).replace(/[<>:"|?*\u0000-\u001f]/g, "_").trim();
  if (!safe || safe === "." || safe === "..") {
    throw new Error("Artifact file name is invalid.");
  }
  return safe;
}

function uniqueFileName(fileName: string, seenNames: Set<string>): string {
  if (!seenNames.has(fileName)) {
    seenNames.add(fileName);
    return fileName;
  }
  const extension = extname(fileName);
  const base = extension ? fileName.slice(0, -extension.length) : fileName;
  let index = 2;
  while (seenNames.has(`${base}-${index}${extension}`)) {
    index += 1;
  }
  const unique = `${base}-${index}${extension}`;
  seenNames.add(unique);
  return unique;
}

function computeSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function inferMimeType(fileName: string): string {
  const lowerName = basename(fileName).toLowerCase();
  if (lowerName === ".env" || lowerName.endsWith(".env")) {
    return "text/plain";
  }
  const ext = extname(fileName).toLowerCase();
  if ([".txt", ".md", ".log", ".diff", ".patch"].includes(ext)) {
    return "text/plain";
  }
  if ([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".cs", ".py"].includes(ext)) {
    return "text/plain";
  }
  if ([".png"].includes(ext)) {
    return "image/png";
  }
  if ([".jpg", ".jpeg"].includes(ext)) {
    return "image/jpeg";
  }
  if ([".zip"].includes(ext)) {
    return "application/zip";
  }
  return "application/octet-stream";
}

function isTextMime(mimeType?: string): boolean {
  return Boolean(mimeType?.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml");
}

function classifyFile(fileName: string): ArtifactFileClassification {
  const lowerName = basename(fileName).toLowerCase();
  if (lowerName === ".env" || lowerName.endsWith(".env")) {
    return "log";
  }
  const ext = extname(fileName).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".cs", ".py", ".css", ".html", ".json"].includes(ext)) {
    return "sourceCode";
  }
  if (ext === ".patch") {
    return "patch";
  }
  if (ext === ".diff") {
    return "diff";
  }
  if ([".log", ".txt"].includes(ext)) {
    return "log";
  }
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return "screenshot";
  }
  if ([".md", ".docx", ".pdf"].includes(ext)) {
    return "document";
  }
  if ([".zip", ".tar", ".gz"].includes(ext)) {
    return "archive";
  }
  return "unknown";
}

function enforceArtifactStorageRoot(localPath: string, artifactRoot: string): void {
  const root = resolve(artifactRoot);
  const candidate = resolve(localPath);
  if (candidate !== root && !candidate.startsWith(`${root}\\`) && !candidate.startsWith(`${root}/`)) {
    throw new Error("Artifact path escapes the AgentBridge artifact root.");
  }
}
