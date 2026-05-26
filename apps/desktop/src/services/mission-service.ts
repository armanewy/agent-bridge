import type { Mission } from "@agentbridge/core";
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

    const [handoffCards, artifacts, runs, verificationResults] = await Promise.all([
      this.store.listHandoffCardsForMission(id),
      this.store.listArtifactsForMission(id),
      this.store.listRunsForMission(id),
      this.store.listVerificationResultsForMission(id)
    ]);
    const handoffCardIds = new Set(handoffCards.map((card) => card.id));
    const handoffIds = new Set(
      (await this.store.listRecentHandoffs(1000))
        .filter((handoff) => handoff.missionId === id || (handoff.handoffCardId && handoffCardIds.has(handoff.handoffCardId)))
        .map((handoff) => handoff.id)
    );
    const deliveryAttempts = (await this.store.listDeliveryAttempts()).filter(
      (attempt) =>
        attempt.missionId === id ||
        (attempt.handoffCardId && handoffCardIds.has(attempt.handoffCardId)) ||
        handoffIds.has(attempt.handoffId)
    );

    return {
      mission,
      handoffCards,
      artifacts,
      deliveryAttempts,
      runs,
      verificationResults
    };
  }
}
