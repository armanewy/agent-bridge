import { randomUUID } from "node:crypto";
import type { CodexDeepLinkTarget, CodexThreadRef, Mission, WorkspaceCandidate } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";

export class WorkspaceResolverService {
  private readonly confirmed = new Map<string, WorkspaceCandidate>();

  constructor(
    private readonly store: LocalStore,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async inferForMission(missionId: string): Promise<WorkspaceCandidate[]> {
    const mission = await this.store.getMission(missionId);
    const candidates: WorkspaceCandidate[] = [];
    for (const ref of await this.store.listCodexThreadRefs()) {
      candidates.push(...this.inferFromCodexThreadRef(ref));
    }
    for (const target of await this.store.listTargets()) {
      if (target.kind === "codexDeepLink") {
        candidates.push(...this.inferFromCodexDeepLinkTarget(target));
      }
    }
    candidates.push(...await this.inferFromPriorMissions({ missionId }));
    if (mission) {
      candidates.push(...this.inferFromText(`${mission.title}\n${mission.goal}`));
    }
    return dedupeCandidates(candidates);
  }

  inferFromCodexThreadRef(threadRef: CodexThreadRef): WorkspaceCandidate[] {
    if (!threadRef.repoPath) {
      return [];
    }
    return [
      this.candidate({
        repoPath: threadRef.repoPath,
        repoName: repoNameFromPath(threadRef.repoPath),
        source: "codexAppServerThread",
        confidence: 95,
        evidence: [`Codex thread ${threadRef.threadId} reported cwd/repoPath.`]
      })
    ];
  }

  inferFromCodexDeepLinkTarget(target: CodexDeepLinkTarget): WorkspaceCandidate[] {
    return [
      this.candidate({
        repoPath: target.repoPath,
        repoName: repoNameFromPath(target.repoPath),
        source: "codexDeepLinkTarget",
        confidence: 95,
        evidence: [`Codex target ${target.id} is configured for this repo path.`]
      })
    ];
  }

  async inferFromPriorMissions(input: { missionId?: string }): Promise<WorkspaceCandidate[]> {
    const missions = await this.store.listMissions();
    return missions
      .filter((mission) => mission.id !== input.missionId && mission.repoContext?.repoPath)
      .slice(0, 3)
      .map((mission) => {
        const input: Parameters<WorkspaceResolverService["candidate"]>[0] = {
          repoName: repoNameFromPath(mission.repoContext?.repoPath ?? mission.title),
          source: "agentBridgeHistory",
          confidence: 90,
          evidence: [`Prior mission ${mission.id} used this workspace.`]
        };
        if (mission.repoContext?.repoPath) {
          input.repoPath = mission.repoContext.repoPath;
        }
        if (mission.repoContext?.currentBranch) {
          input.branch = mission.repoContext.currentBranch;
        }
        return this.candidate(input);
      });
  }

  inferFromText(text: string): WorkspaceCandidate[] {
    const githubMatch = text.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    if (githubMatch) {
      const remoteUrl = `https://github.com/${githubMatch[1]}/${githubMatch[2]}`;
      return [
        this.candidate({
          repoName: `${githubMatch[1]}/${githubMatch[2]}`,
          remoteUrl,
          source: "githubUrl",
          confidence: 80,
          evidence: [`Intent contains GitHub URL ${remoteUrl}.`]
        })
      ];
    }
    const hint = text.match(/\b([A-Za-z][A-Za-z0-9_.-]*(?:-[A-Za-z0-9_.-]+)+)\b/);
    if (!hint) {
      return [];
    }
    const repoName = hint[1];
    return repoName
      ? [
          this.candidate({
            repoName,
            source: "windowTitle",
            confidence: 50,
            evidence: [`Text contains repo-like hint ${repoName}.`]
          })
        ]
      : [];
  }

  getBestCandidate(candidates: WorkspaceCandidate[]): WorkspaceCandidate | undefined {
    return [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
  }

  confirmWorkspace(candidateId: string): WorkspaceCandidate | undefined {
    return this.confirmed.get(candidateId);
  }

  private candidate(input: {
    repoName?: string;
    repoPath?: string;
    branch?: string;
    remoteUrl?: string;
    source: WorkspaceCandidate["source"];
    confidence: number;
    evidence: string[];
  }): WorkspaceCandidate {
    const candidate: WorkspaceCandidate = {
      id: `workspace_candidate_${randomUUID()}`,
      source: input.source,
      confidence: input.confidence,
      evidence: input.evidence,
      requiresConfirmation: input.confidence < 90,
      createdAt: this.now(),
      ...(input.repoName ? { repoName: input.repoName } : {}),
      ...(input.repoPath ? { repoPath: input.repoPath } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {})
    };
    this.confirmed.set(candidate.id, candidate);
    return candidate;
  }
}

function repoNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? path;
}

function dedupeCandidates(candidates: WorkspaceCandidate[]): WorkspaceCandidate[] {
  const seen = new Set<string>();
  const output: WorkspaceCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    const key = candidate.repoPath ?? candidate.remoteUrl ?? candidate.repoName ?? candidate.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(candidate);
  }
  return output;
}
