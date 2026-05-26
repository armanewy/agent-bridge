import type { Capture, Mission } from "@agentbridge/core";
import type { LocalStore } from "@agentbridge/local-store";
import type { MissionDetail } from "./bridge-contract.js";

export class MissionService {
  constructor(private readonly store: LocalStore) {}

  async listMissions(): Promise<Mission[]> {
    return this.store.listMissions();
  }

  async getMissionDetail(id: string): Promise<MissionDetail | undefined> {
    const mission = await this.store.getMission(id);
    if (!mission) {
      return undefined;
    }

    const [
      handoffCards,
      artifacts,
      artifactFiles,
      artifactBundles,
      runs,
      verificationResults,
      completionContracts,
      missionWorkspaces,
      fileOwnership
    ] = await Promise.all([
      this.store.listHandoffCardsForMission(id),
      this.store.listArtifactsForMission(id),
      this.store.listArtifactFilesForMission(id),
      this.store.listArtifactBundlesForMission(id),
      this.store.listRunsForMission(id),
      this.store.listVerificationResultsForMission(id),
      this.store.listCompletionContractsForMission(id),
      this.store.listMissionWorkspaces(id),
      this.store.listFileOwnershipForMission(id)
    ]);
    const completionEvidence = (
      await Promise.all(completionContracts.map((contract) => this.store.listCompletionEvidenceForContract(contract.id)))
    ).flat();
    const handoffCardIds = new Set(handoffCards.map((card) => card.id));
    const captures = (await Promise.all(mission.captureIds.map((captureId) => this.store.getCapture(captureId)))).filter(
      (capture): capture is Capture => Boolean(capture)
    );
    const deliveryAttemptIds = new Set(handoffCards.flatMap((card) => card.deliveryAttemptIds));
    const deliveryAttempts = (await this.store.listDeliveryAttempts()).filter(
      (attempt) =>
        attempt.missionId === id ||
        (attempt.handoffCardId && handoffCardIds.has(attempt.handoffCardId)) ||
        deliveryAttemptIds.has(attempt.id)
    );
    const agentEvents = (await this.store.listAgentEvents()).filter((event) => event.payload.missionId === id);

    return {
      mission,
      handoffCards,
      captures,
      artifacts,
      artifactFiles,
      artifactBundles,
      completionContracts,
      completionEvidence,
      missionWorkspaces,
      fileOwnership,
      deliveryAttempts,
      runs,
      verificationResults,
      agentEvents
    };
  }
}
