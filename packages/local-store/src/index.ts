import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  AuditEventSchema,
  ArtifactSchema,
  CaptureSchema,
  HandoffSchema,
  HandoffCardSchema,
  LinkSchema,
  MissionSchema,
  RunSchema,
  RunStepSchema,
  SourceEndpointSchema,
  TargetEndpointSchema,
  VerificationResultSchema,
  type Approval,
  type Artifact,
  type AuditEvent,
  type Capture,
  type Handoff,
  type HandoffCard,
  type Link,
  type DeliveryAttempt,
  DeliveryAttemptSchema,
  type Mission,
  type MissionStatus,
  type Run,
  type RunStep,
  type Setting,
  type SourceEndpoint,
  type TargetEndpoint,
  type VerificationResult
} from "@agentbridge/core";

export const CURRENT_STORE_VERSION = 2;

export interface LocalStore {
  saveLink(link: Link): Promise<void>;
  getLink(id: string): Promise<Link | undefined>;
  listLinks(): Promise<Link[]>;
  deleteLink(id: string): Promise<boolean>;
  saveSource(source: SourceEndpoint): Promise<void>;
  getSource(id: string): Promise<SourceEndpoint | undefined>;
  listSources(): Promise<SourceEndpoint[]>;
  saveTarget(target: TargetEndpoint): Promise<void>;
  getTarget(id: string): Promise<TargetEndpoint | undefined>;
  listTargets(): Promise<TargetEndpoint[]>;
  saveCapture(capture: Capture): Promise<void>;
  getCapture(id: string): Promise<Capture | undefined>;
  listRecentCaptures(limit?: number): Promise<Capture[]>;
  saveHandoff(handoff: Handoff): Promise<void>;
  getHandoff(id: string): Promise<Handoff | undefined>;
  listRecentHandoffs(limit?: number): Promise<Handoff[]>;
  deleteHandoff(id: string): Promise<boolean>;
  saveDeliveryAttempt(attempt: DeliveryAttempt): Promise<void>;
  listDeliveryAttempts(handoffId?: string): Promise<DeliveryAttempt[]>;
  saveMission(mission: Mission): Promise<void>;
  getMission(id: string): Promise<Mission | undefined>;
  listMissions(): Promise<Mission[]>;
  updateMissionStatus(id: string, status: MissionStatus): Promise<Mission | undefined>;
  deleteMission(id: string): Promise<boolean>;
  saveHandoffCard(card: HandoffCard): Promise<void>;
  getHandoffCard(id: string): Promise<HandoffCard | undefined>;
  listHandoffCardsForMission(missionId: string): Promise<HandoffCard[]>;
  saveArtifact(artifact: Artifact): Promise<void>;
  getArtifact(id: string): Promise<Artifact | undefined>;
  listArtifactsForMission(missionId: string): Promise<Artifact[]>;
  listArtifactsForHandoffCard(handoffCardId: string): Promise<Artifact[]>;
  saveRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | undefined>;
  listRunsForMission(missionId: string): Promise<Run[]>;
  appendRunStep(step: RunStep): Promise<void>;
  listRunSteps(runId: string): Promise<RunStep[]>;
  saveVerificationResult(result: VerificationResult): Promise<void>;
  listVerificationResultsForMission(missionId: string): Promise<VerificationResult[]>;
  saveApproval(approval: Approval): Promise<void>;
  getApproval(id: string): Promise<Approval | undefined>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
  saveSetting(key: string, value: unknown): Promise<void>;
  getSetting<T = unknown>(key: string): Promise<T | undefined>;
}

interface StoreData {
  version: number;
  links: Record<string, Link>;
  sources: Record<string, SourceEndpoint>;
  targets: Record<string, TargetEndpoint>;
  captures: Record<string, Capture>;
  handoffs: Record<string, Handoff>;
  deliveryAttempts: Record<string, DeliveryAttempt>;
  missions: Record<string, Mission>;
  handoffCards: Record<string, HandoffCard>;
  artifacts: Record<string, Artifact>;
  runs: Record<string, Run>;
  runSteps: Record<string, RunStep>;
  verificationResults: Record<string, VerificationResult>;
  approvals: Record<string, Approval>;
  auditEvents: AuditEvent[];
  settings: Record<string, Setting>;
}

export class JsonFileStore implements LocalStore {
  private readonly filePath: string;

  constructor(private readonly rootDir: string, fileName = "agentbridge-store.json") {
    this.filePath = join(rootDir, fileName);
  }

  async saveLink(link: Link): Promise<void> {
    LinkSchema.parse(link);
    await this.update((data) => {
      data.links[link.id] = link;
    });
  }

  async getLink(id: string): Promise<Link | undefined> {
    return (await this.read()).links[id];
  }

  async listLinks(): Promise<Link[]> {
    return Object.values((await this.read()).links).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteLink(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((data) => {
      deleted = Object.hasOwn(data.links, id);
      delete data.links[id];
    });
    return deleted;
  }

  async saveSource(source: SourceEndpoint): Promise<void> {
    SourceEndpointSchema.parse(source);
    await this.update((data) => {
      data.sources[source.id] = source;
    });
  }

  async getSource(id: string): Promise<SourceEndpoint | undefined> {
    return (await this.read()).sources[id];
  }

  async listSources(): Promise<SourceEndpoint[]> {
    return Object.values((await this.read()).sources).sort((a, b) => b.boundAt.localeCompare(a.boundAt));
  }

  async saveTarget(target: TargetEndpoint): Promise<void> {
    TargetEndpointSchema.parse(target);
    await this.update((data) => {
      data.targets[target.id] = target;
    });
  }

  async getTarget(id: string): Promise<TargetEndpoint | undefined> {
    return (await this.read()).targets[id];
  }

  async listTargets(): Promise<TargetEndpoint[]> {
    return Object.values((await this.read()).targets);
  }

  async saveCapture(capture: Capture): Promise<void> {
    CaptureSchema.parse(capture);
    await this.update((data) => {
      data.captures[capture.id] = capture;
    });
  }

  async getCapture(id: string): Promise<Capture | undefined> {
    return (await this.read()).captures[id];
  }

  async listRecentCaptures(limit = 20): Promise<Capture[]> {
    return Object.values((await this.read()).captures)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async saveHandoff(handoff: Handoff): Promise<void> {
    HandoffSchema.parse(handoff);
    await this.update((data) => {
      data.handoffs[handoff.id] = handoff;
    });
  }

  async getHandoff(id: string): Promise<Handoff | undefined> {
    return (await this.read()).handoffs[id];
  }

  async listRecentHandoffs(limit = 20): Promise<Handoff[]> {
    return Object.values((await this.read()).handoffs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async deleteHandoff(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((data) => {
      deleted = Object.hasOwn(data.handoffs, id);
      delete data.handoffs[id];
    });
    return deleted;
  }

  async saveDeliveryAttempt(attempt: DeliveryAttempt): Promise<void> {
    DeliveryAttemptSchema.parse(attempt);
    await this.update((data) => {
      data.deliveryAttempts[attempt.id] = attempt;
    });
  }

  async listDeliveryAttempts(handoffId?: string): Promise<DeliveryAttempt[]> {
    return Object.values((await this.read()).deliveryAttempts)
      .filter((attempt) => !handoffId || attempt.handoffId === handoffId)
      .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt));
  }

  async saveMission(mission: Mission): Promise<void> {
    MissionSchema.parse(mission);
    await this.update((data) => {
      data.missions[mission.id] = mission;
    });
  }

  async getMission(id: string): Promise<Mission | undefined> {
    return (await this.read()).missions[id];
  }

  async listMissions(): Promise<Mission[]> {
    return Object.values((await this.read()).missions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateMissionStatus(id: string, status: MissionStatus): Promise<Mission | undefined> {
    let updated: Mission | undefined;
    await this.update((data) => {
      const mission = data.missions[id];
      if (!mission) {
        return;
      }
      updated = {
        ...mission,
        status,
        updatedAt: new Date().toISOString()
      };
      data.missions[id] = updated;
    });
    return updated;
  }

  async deleteMission(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((data) => {
      deleted = Object.hasOwn(data.missions, id);
      delete data.missions[id];
    });
    return deleted;
  }

  async saveHandoffCard(card: HandoffCard): Promise<void> {
    HandoffCardSchema.parse(card);
    await this.update((data) => {
      data.handoffCards[card.id] = card;
    });
  }

  async getHandoffCard(id: string): Promise<HandoffCard | undefined> {
    return (await this.read()).handoffCards[id];
  }

  async listHandoffCardsForMission(missionId: string): Promise<HandoffCard[]> {
    return Object.values((await this.read()).handoffCards)
      .filter((card) => card.missionId === missionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveArtifact(artifact: Artifact): Promise<void> {
    ArtifactSchema.parse(artifact);
    await this.update((data) => {
      data.artifacts[artifact.id] = artifact;
    });
  }

  async getArtifact(id: string): Promise<Artifact | undefined> {
    return (await this.read()).artifacts[id];
  }

  async listArtifactsForMission(missionId: string): Promise<Artifact[]> {
    return Object.values((await this.read()).artifacts)
      .filter((artifact) => artifact.missionId === missionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listArtifactsForHandoffCard(handoffCardId: string): Promise<Artifact[]> {
    return Object.values((await this.read()).artifacts)
      .filter((artifact) => artifact.handoffCardId === handoffCardId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveRun(run: Run): Promise<void> {
    RunSchema.parse(run);
    await this.update((data) => {
      data.runs[run.id] = run;
    });
  }

  async getRun(id: string): Promise<Run | undefined> {
    return (await this.read()).runs[id];
  }

  async listRunsForMission(missionId: string): Promise<Run[]> {
    return Object.values((await this.read()).runs)
      .filter((run) => run.missionId === missionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async appendRunStep(step: RunStep): Promise<void> {
    RunStepSchema.parse(step);
    await this.update((data) => {
      data.runSteps[step.id] = step;
    });
  }

  async listRunSteps(runId: string): Promise<RunStep[]> {
    return Object.values((await this.read()).runSteps)
      .filter((step) => step.runId === runId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveVerificationResult(result: VerificationResult): Promise<void> {
    VerificationResultSchema.parse(result);
    await this.update((data) => {
      data.verificationResults[result.id] = result;
    });
  }

  async listVerificationResultsForMission(missionId: string): Promise<VerificationResult[]> {
    return Object.values((await this.read()).verificationResults)
      .filter((result) => result.missionId === missionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveApproval(approval: Approval): Promise<void> {
    await this.update((data) => {
      data.approvals[approval.id] = approval;
    });
  }

  async getApproval(id: string): Promise<Approval | undefined> {
    return (await this.read()).approvals[id];
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    AuditEventSchema.parse(event);
    await this.update((data) => {
      data.auditEvents.push(event);
    });
  }

  async listAuditEvents(limit = 100): Promise<AuditEvent[]> {
    return [...(await this.read()).auditEvents]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async clearAuditEvents(): Promise<void> {
    await this.update((data) => {
      data.auditEvents = [];
    });
  }

  async saveSetting(key: string, value: unknown): Promise<void> {
    await this.update((data) => {
      data.settings[key] = { key, value, updatedAt: new Date().toISOString() };
    });
  }

  async getSetting<T = unknown>(key: string): Promise<T | undefined> {
    return (await this.read()).settings[key]?.value as T | undefined;
  }

  private async update(mutator: (data: StoreData) => void): Promise<void> {
    const data = await this.read();
    mutator(data);
    await this.write(data);
  }

  private async read(): Promise<StoreData> {
    await mkdir(this.rootDir, { recursive: true });

    if (!existsSync(this.filePath)) {
      const empty = createEmptyStore();
      await this.write(empty);
      return empty;
    }

    const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as StoreData;
    return migrate(parsed);
  }

  private async write(data: StoreData): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

export function createEmptyStore(): StoreData {
  return {
    version: CURRENT_STORE_VERSION,
    links: {},
    sources: {},
    targets: {},
    captures: {},
    handoffs: {},
    deliveryAttempts: {},
    missions: {},
    handoffCards: {},
    artifacts: {},
    runs: {},
    runSteps: {},
    verificationResults: {},
    approvals: {},
    auditEvents: [],
    settings: {}
  };
}

export function defaultAgentBridgeDataDir(): string {
  if (process.env.AGENTBRIDGE_STORE_DIR) {
    return process.env.AGENTBRIDGE_STORE_DIR;
  }

  const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  return join(base, "AgentBridge");
}

function migrate(data: StoreData): StoreData {
  return {
    ...createEmptyStore(),
    ...data,
    version: CURRENT_STORE_VERSION
  };
}
