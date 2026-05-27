import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  AuditEventSchema,
  AgentEventSchema,
  AgentProviderProfileSchema,
  AgentSessionRefSchema,
  AgentTurnSchema,
  ArtifactSchema,
  ArtifactBundleSchema,
  ArtifactFileSchema,
  AutopilotPolicySchema,
  AutopilotRunSchema,
  AutopilotStepSchema,
  CompletionContractSchema,
  CompletionEvidenceSchema,
  CodexThreadRefSchema,
  FileOwnershipSchema,
  HandoffCardSchema,
  LinkableComponentSchema,
  MissionSchema,
  MissionQueueItemSchema,
  MissionWorkspaceSchema,
  RunSchema,
  RunStepSchema,
  TargetEndpointSchema,
  VerificationResultSchema,
  WorkflowTemplateSchema,
  type AgentEvent,
  type AgentProviderProfile,
  type AgentSessionRef,
  type AgentTurn,
  type Artifact,
  type ArtifactBundle,
  type ArtifactFile,
  type AutopilotPolicy,
  type AutopilotRun,
  type AutopilotRunStatus,
  type AutopilotStep,
  type AuditEvent,
  type CompletionContract,
  type CompletionEvidence,
  type CodexThreadRef,
  type FileOwnership,
  type HandoffCard,
  type LinkableComponent,
  type DeliveryAttempt,
  DeliveryAttemptSchema,
  type Mission,
  type MissionStatus,
  type Run,
  type RunStep,
  type MissionQueueItem,
  type MissionWorkspace,
  type Setting,
  type TargetEndpoint,
  type VerificationResult,
  type WorkflowTemplate,
  type UserDecision,
  UserDecisionSchema
} from "@agentbridge/core";

export const CURRENT_STORE_VERSION = 9;

export interface LocalStore {
  saveLinkableComponent(component: LinkableComponent): Promise<void>;
  getLinkableComponent(id: string): Promise<LinkableComponent | undefined>;
  listLinkableComponents(): Promise<LinkableComponent[]>;
  saveWorkflowTemplate(template: WorkflowTemplate): Promise<void>;
  getWorkflowTemplate(id: string): Promise<WorkflowTemplate | undefined>;
  listWorkflowTemplates(): Promise<WorkflowTemplate[]>;
  deleteWorkflowTemplate(id: string): Promise<boolean>;
  saveCompletionContract(contract: CompletionContract): Promise<void>;
  getCompletionContract(id: string): Promise<CompletionContract | undefined>;
  listCompletionContractsForMission(missionId: string): Promise<CompletionContract[]>;
  saveCompletionEvidence(evidence: CompletionEvidence): Promise<void>;
  listCompletionEvidenceForContract(contractId: string): Promise<CompletionEvidence[]>;
  saveMissionWorkspace(workspace: MissionWorkspace): Promise<void>;
  getMissionWorkspace(id: string): Promise<MissionWorkspace | undefined>;
  listMissionWorkspaces(missionId?: string): Promise<MissionWorkspace[]>;
  saveFileOwnership(ownership: FileOwnership): Promise<void>;
  listFileOwnershipForMission(missionId: string): Promise<FileOwnership[]>;
  listFileOwnershipByPath(relativePath: string): Promise<FileOwnership[]>;
  saveMissionQueueItem(item: MissionQueueItem): Promise<void>;
  getMissionQueueItem(id: string): Promise<MissionQueueItem | undefined>;
  listMissionQueueItems(): Promise<MissionQueueItem[]>;
  saveCodexThreadRef(ref: CodexThreadRef): Promise<void>;
  getCodexThreadRef(threadId: string): Promise<CodexThreadRef | undefined>;
  listCodexThreadRefs(repoPath?: string): Promise<CodexThreadRef[]>;
  saveProviderProfile(profile: AgentProviderProfile): Promise<void>;
  getProviderProfile(id: string): Promise<AgentProviderProfile | undefined>;
  listProviderProfiles(): Promise<AgentProviderProfile[]>;
  saveAgentSession(session: AgentSessionRef): Promise<void>;
  getAgentSession(id: string): Promise<AgentSessionRef | undefined>;
  listAgentSessions(providerId?: string): Promise<AgentSessionRef[]>;
  saveAgentTurn(turn: AgentTurn): Promise<void>;
  getAgentTurn(id: string): Promise<AgentTurn | undefined>;
  listAgentTurns(sessionRefId: string): Promise<AgentTurn[]>;
  appendAgentEvent(event: AgentEvent): Promise<void>;
  listAgentEvents(filter?: AgentEventFilter): Promise<AgentEvent[]>;
  saveAutopilotPolicy(policy: AutopilotPolicy): Promise<void>;
  getAutopilotPolicy(id: string): Promise<AutopilotPolicy | undefined>;
  listAutopilotPolicies(): Promise<AutopilotPolicy[]>;
  saveAutopilotRun(run: AutopilotRun): Promise<void>;
  getAutopilotRun(id: string): Promise<AutopilotRun | undefined>;
  listAutopilotRunsForMission(missionId: string): Promise<AutopilotRun[]>;
  updateAutopilotRunStatus(id: string, status: AutopilotRunStatus, patch?: Partial<AutopilotRun>): Promise<AutopilotRun | undefined>;
  appendAutopilotStep(step: AutopilotStep): Promise<void>;
  listAutopilotSteps(autopilotRunId: string): Promise<AutopilotStep[]>;
  saveUserDecision(decision: UserDecision): Promise<void>;
  getUserDecision(id: string): Promise<UserDecision | undefined>;
  listPendingUserDecisions(missionId?: string): Promise<UserDecision[]>;
  resolveUserDecision(id: string, selectedOption: string): Promise<UserDecision | undefined>;
  saveTarget(target: TargetEndpoint): Promise<void>;
  getTarget(id: string): Promise<TargetEndpoint | undefined>;
  listTargets(): Promise<TargetEndpoint[]>;
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
  saveArtifactFile(file: ArtifactFile): Promise<void>;
  getArtifactFile(id: string): Promise<ArtifactFile | undefined>;
  listArtifactFilesForMission(missionId: string): Promise<ArtifactFile[]>;
  saveArtifactBundle(bundle: ArtifactBundle): Promise<void>;
  getArtifactBundle(id: string): Promise<ArtifactBundle | undefined>;
  listArtifactBundlesForMission(missionId: string): Promise<ArtifactBundle[]>;
  saveRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | undefined>;
  listRunsForMission(missionId: string): Promise<Run[]>;
  appendRunStep(step: RunStep): Promise<void>;
  listRunSteps(runId: string): Promise<RunStep[]>;
  saveVerificationResult(result: VerificationResult): Promise<void>;
  listVerificationResultsForMission(missionId: string): Promise<VerificationResult[]>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
  saveSetting(key: string, value: unknown): Promise<void>;
  getSetting<T = unknown>(key: string): Promise<T | undefined>;
}

export interface AgentEventFilter {
  providerId?: string;
  sessionRefId?: string;
  turnId?: string;
  type?: string;
}

interface StoreData {
  version: number;
  linkableComponents: Record<string, LinkableComponent>;
  workflowTemplates: Record<string, WorkflowTemplate>;
  completionContracts: Record<string, CompletionContract>;
  completionEvidence: Record<string, CompletionEvidence>;
  missionWorkspaces: Record<string, MissionWorkspace>;
  fileOwnership: Record<string, FileOwnership>;
  missionQueue: Record<string, MissionQueueItem>;
  codexThreadRefs: Record<string, CodexThreadRef>;
  providerProfiles: Record<string, AgentProviderProfile>;
  agentSessions: Record<string, AgentSessionRef>;
  agentTurns: Record<string, AgentTurn>;
  agentEvents: Record<string, AgentEvent>;
  autopilotPolicies: Record<string, AutopilotPolicy>;
  autopilotRuns: Record<string, AutopilotRun>;
  autopilotSteps: Record<string, AutopilotStep>;
  userDecisions: Record<string, UserDecision>;
  targets: Record<string, TargetEndpoint>;
  deliveryAttempts: Record<string, DeliveryAttempt>;
  missions: Record<string, Mission>;
  handoffCards: Record<string, HandoffCard>;
  artifacts: Record<string, Artifact>;
  artifactFiles: Record<string, ArtifactFile>;
  artifactBundles: Record<string, ArtifactBundle>;
  runs: Record<string, Run>;
  runSteps: Record<string, RunStep>;
  verificationResults: Record<string, VerificationResult>;
  auditEvents: AuditEvent[];
  settings: Record<string, Setting>;
}

export class JsonFileStore implements LocalStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly rootDir: string, fileName = "agentbridge-store.json") {
    this.filePath = join(rootDir, fileName);
  }

  async saveLinkableComponent(component: LinkableComponent): Promise<void> {
    LinkableComponentSchema.parse(component);
    await this.update((data) => {
      data.linkableComponents[component.id] = component;
    });
  }

  async getLinkableComponent(id: string): Promise<LinkableComponent | undefined> {
    return (await this.read()).linkableComponents[id];
  }

  async listLinkableComponents(): Promise<LinkableComponent[]> {
    return Object.values((await this.read()).linkableComponents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveWorkflowTemplate(template: WorkflowTemplate): Promise<void> {
    WorkflowTemplateSchema.parse(template);
    await this.update((data) => {
      data.workflowTemplates[template.id] = template;
    });
  }

  async getWorkflowTemplate(id: string): Promise<WorkflowTemplate | undefined> {
    return (await this.read()).workflowTemplates[id];
  }

  async listWorkflowTemplates(): Promise<WorkflowTemplate[]> {
    return Object.values((await this.read()).workflowTemplates).sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteWorkflowTemplate(id: string): Promise<boolean> {
    let deleted = false;
    await this.update((data) => {
      deleted = Object.hasOwn(data.workflowTemplates, id);
      delete data.workflowTemplates[id];
    });
    return deleted;
  }

  async saveCompletionContract(contract: CompletionContract): Promise<void> {
    CompletionContractSchema.parse(contract);
    await this.update((data) => {
      data.completionContracts[contract.id] = contract;
    });
  }

  async getCompletionContract(id: string): Promise<CompletionContract | undefined> {
    return (await this.read()).completionContracts[id];
  }

  async listCompletionContractsForMission(missionId: string): Promise<CompletionContract[]> {
    return Object.values((await this.read()).completionContracts)
      .filter((contract) => contract.missionId === missionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveCompletionEvidence(evidence: CompletionEvidence): Promise<void> {
    CompletionEvidenceSchema.parse(evidence);
    await this.update((data) => {
      data.completionEvidence[evidence.id] = evidence;
    });
  }

  async listCompletionEvidenceForContract(contractId: string): Promise<CompletionEvidence[]> {
    return Object.values((await this.read()).completionEvidence)
      .filter((evidence) => evidence.contractId === contractId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveMissionWorkspace(workspace: MissionWorkspace): Promise<void> {
    MissionWorkspaceSchema.parse(workspace);
    await this.update((data) => {
      data.missionWorkspaces[workspace.id] = workspace;
    });
  }

  async getMissionWorkspace(id: string): Promise<MissionWorkspace | undefined> {
    return (await this.read()).missionWorkspaces[id];
  }

  async listMissionWorkspaces(missionId?: string): Promise<MissionWorkspace[]> {
    return Object.values((await this.read()).missionWorkspaces)
      .filter((workspace) => !missionId || workspace.missionId === missionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveFileOwnership(ownership: FileOwnership): Promise<void> {
    FileOwnershipSchema.parse(ownership);
    await this.update((data) => {
      data.fileOwnership[ownership.id] = ownership;
    });
  }

  async listFileOwnershipForMission(missionId: string): Promise<FileOwnership[]> {
    return Object.values((await this.read()).fileOwnership)
      .filter((ownership) => ownership.missionId === missionId)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async listFileOwnershipByPath(relativePath: string): Promise<FileOwnership[]> {
    const normalized = normalizePath(relativePath);
    return Object.values((await this.read()).fileOwnership)
      .filter((ownership) => normalizePath(ownership.relativePath) === normalized)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveMissionQueueItem(item: MissionQueueItem): Promise<void> {
    MissionQueueItemSchema.parse(item);
    await this.update((data) => {
      data.missionQueue[item.id] = item;
    });
  }

  async getMissionQueueItem(id: string): Promise<MissionQueueItem | undefined> {
    return (await this.read()).missionQueue[id];
  }

  async listMissionQueueItems(): Promise<MissionQueueItem[]> {
    return Object.values((await this.read()).missionQueue).sort((a, b) => {
      const priority = b.priority - a.priority;
      return priority === 0 ? a.createdAt.localeCompare(b.createdAt) : priority;
    });
  }

  async saveCodexThreadRef(ref: CodexThreadRef): Promise<void> {
    CodexThreadRefSchema.parse(ref);
    await this.update((data) => {
      data.codexThreadRefs[ref.threadId] = ref;
    });
  }

  async getCodexThreadRef(threadId: string): Promise<CodexThreadRef | undefined> {
    return (await this.read()).codexThreadRefs[threadId];
  }

  async listCodexThreadRefs(repoPath?: string): Promise<CodexThreadRef[]> {
    return Object.values((await this.read()).codexThreadRefs)
      .filter((ref) => !repoPath || normalizePath(ref.repoPath) === normalizePath(repoPath))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async saveProviderProfile(profile: AgentProviderProfile): Promise<void> {
    AgentProviderProfileSchema.parse(profile);
    await this.update((data) => {
      data.providerProfiles[profile.id] = profile;
    });
  }

  async getProviderProfile(id: string): Promise<AgentProviderProfile | undefined> {
    return (await this.read()).providerProfiles[id];
  }

  async listProviderProfiles(): Promise<AgentProviderProfile[]> {
    return Object.values((await this.read()).providerProfiles).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async saveAgentSession(session: AgentSessionRef): Promise<void> {
    AgentSessionRefSchema.parse(session);
    await this.update((data) => {
      data.agentSessions[session.id] = session;
    });
  }

  async getAgentSession(id: string): Promise<AgentSessionRef | undefined> {
    return (await this.read()).agentSessions[id];
  }

  async listAgentSessions(providerId?: string): Promise<AgentSessionRef[]> {
    return Object.values((await this.read()).agentSessions)
      .filter((session) => !providerId || session.providerId === providerId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async saveAgentTurn(turn: AgentTurn): Promise<void> {
    AgentTurnSchema.parse(turn);
    await this.update((data) => {
      data.agentTurns[turn.id] = turn;
    });
  }

  async getAgentTurn(id: string): Promise<AgentTurn | undefined> {
    return (await this.read()).agentTurns[id];
  }

  async listAgentTurns(sessionRefId: string): Promise<AgentTurn[]> {
    return Object.values((await this.read()).agentTurns)
      .filter((turn) => turn.sessionRefId === sessionRefId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async appendAgentEvent(event: AgentEvent): Promise<void> {
    AgentEventSchema.parse(event);
    await this.update((data) => {
      data.agentEvents[event.id] = event;
    });
  }

  async listAgentEvents(filter: AgentEventFilter = {}): Promise<AgentEvent[]> {
    return Object.values((await this.read()).agentEvents)
      .filter((event) => !filter.providerId || event.providerId === filter.providerId)
      .filter((event) => !filter.sessionRefId || event.sessionRefId === filter.sessionRefId)
      .filter((event) => !filter.turnId || event.turnId === filter.turnId)
      .filter((event) => !filter.type || event.type === filter.type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveAutopilotPolicy(policy: AutopilotPolicy): Promise<void> {
    AutopilotPolicySchema.parse(policy);
    await this.update((data) => {
      data.autopilotPolicies[policy.id] = policy;
    });
  }

  async getAutopilotPolicy(id: string): Promise<AutopilotPolicy | undefined> {
    return (await this.read()).autopilotPolicies[id];
  }

  async listAutopilotPolicies(): Promise<AutopilotPolicy[]> {
    return Object.values((await this.read()).autopilotPolicies).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveAutopilotRun(run: AutopilotRun): Promise<void> {
    AutopilotRunSchema.parse(run);
    await this.update((data) => {
      data.autopilotRuns[run.id] = run;
    });
  }

  async getAutopilotRun(id: string): Promise<AutopilotRun | undefined> {
    return (await this.read()).autopilotRuns[id];
  }

  async listAutopilotRunsForMission(missionId: string): Promise<AutopilotRun[]> {
    return Object.values((await this.read()).autopilotRuns)
      .filter((run) => run.missionId === missionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateAutopilotRunStatus(
    id: string,
    status: AutopilotRunStatus,
    patch: Partial<AutopilotRun> = {}
  ): Promise<AutopilotRun | undefined> {
    let updated: AutopilotRun | undefined;
    await this.update((data) => {
      const run = data.autopilotRuns[id];
      if (!run) {
        return;
      }
      updated = {
        ...run,
        ...patch,
        status,
        updatedAt: new Date().toISOString()
      };
      AutopilotRunSchema.parse(updated);
      data.autopilotRuns[id] = updated;
    });
    return updated;
  }

  async appendAutopilotStep(step: AutopilotStep): Promise<void> {
    AutopilotStepSchema.parse(step);
    await this.update((data) => {
      data.autopilotSteps[step.id] = step;
    });
  }

  async listAutopilotSteps(autopilotRunId: string): Promise<AutopilotStep[]> {
    return Object.values((await this.read()).autopilotSteps)
      .filter((step) => step.autopilotRunId === autopilotRunId)
      .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  }

  async saveUserDecision(decision: UserDecision): Promise<void> {
    UserDecisionSchema.parse(decision);
    await this.update((data) => {
      data.userDecisions[decision.id] = decision;
    });
  }

  async getUserDecision(id: string): Promise<UserDecision | undefined> {
    return (await this.read()).userDecisions[id];
  }

  async listPendingUserDecisions(missionId?: string): Promise<UserDecision[]> {
    return Object.values((await this.read()).userDecisions)
      .filter((decision) => decision.status === "pending")
      .filter((decision) => !missionId || decision.missionId === missionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveUserDecision(id: string, selectedOption: string): Promise<UserDecision | undefined> {
    let updated: UserDecision | undefined;
    await this.update((data) => {
      const decision = data.userDecisions[id];
      if (!decision) {
        return;
      }
      updated = {
        ...decision,
        selectedOption,
        status: "resolved",
        resolvedAt: new Date().toISOString()
      };
      UserDecisionSchema.parse(updated);
      data.userDecisions[id] = updated;
    });
    return updated;
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

  async saveArtifactFile(file: ArtifactFile): Promise<void> {
    ArtifactFileSchema.parse(file);
    await this.update((data) => {
      data.artifactFiles[file.id] = file;
    });
  }

  async getArtifactFile(id: string): Promise<ArtifactFile | undefined> {
    return (await this.read()).artifactFiles[id];
  }

  async listArtifactFilesForMission(missionId: string): Promise<ArtifactFile[]> {
    return Object.values((await this.read()).artifactFiles)
      .filter((file) => file.missionId === missionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveArtifactBundle(bundle: ArtifactBundle): Promise<void> {
    ArtifactBundleSchema.parse(bundle);
    await this.update((data) => {
      data.artifactBundles[bundle.id] = bundle;
    });
  }

  async getArtifactBundle(id: string): Promise<ArtifactBundle | undefined> {
    return (await this.read()).artifactBundles[id];
  }

  async listArtifactBundlesForMission(missionId: string): Promise<ArtifactBundle[]> {
    return Object.values((await this.read()).artifactBundles)
      .filter((bundle) => bundle.missionId === missionId)
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
    const operation = this.writeQueue.then(async () => {
      const data = await this.read();
      mutator(data);
      await this.write(data);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }

  private async read(): Promise<StoreData> {
    await mkdir(this.rootDir, { recursive: true });

    if (!existsSync(this.filePath)) {
      const empty = createEmptyStore();
      await this.write(empty);
      return empty;
    }

    return JSON.parse(await readFile(this.filePath, "utf8")) as StoreData;
  }

  private async write(data: StoreData): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await renameWithRetry(tmpPath, this.filePath);
  }
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EACCES";
      if (!retryable || attempt === maxAttempts) {
        await rm(source, { force: true }).catch(() => undefined);
        throw error;
      }
      await sleep(25 * attempt);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createEmptyStore(): StoreData {
  return {
    version: CURRENT_STORE_VERSION,
    linkableComponents: {},
    workflowTemplates: {},
    completionContracts: {},
    completionEvidence: {},
    missionWorkspaces: {},
    fileOwnership: {},
    missionQueue: {},
    codexThreadRefs: {},
    providerProfiles: {},
    agentSessions: {},
    agentTurns: {},
    agentEvents: {},
    autopilotPolicies: {},
    autopilotRuns: {},
    autopilotSteps: {},
    userDecisions: {},
    targets: {},
    deliveryAttempts: {},
    missions: {},
    handoffCards: {},
    artifacts: {},
    artifactFiles: {},
    artifactBundles: {},
    runs: {},
    runSteps: {},
    verificationResults: {},
    auditEvents: [],
    settings: {}
  };
}

export function defaultAgentBridgeDataDir(): string {
  if (process.env.AGENTBRIDGE_STORE_DIR) {
    return process.env.AGENTBRIDGE_STORE_DIR;
  }

  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "AgentBridge");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "AgentBridge");
  }

  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "AgentBridge");
}

function normalizePath(value?: string): string | undefined {
  return value?.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
