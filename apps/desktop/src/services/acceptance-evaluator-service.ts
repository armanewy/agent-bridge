import { type CompletionContract, type CompletionEvidence, evaluateCompletionContract } from "@agentbridge/core";

export class AcceptanceEvaluatorService {
  evaluate(contract: CompletionContract, evidence: CompletionEvidence[]) {
    return evaluateCompletionContract(contract, evidence);
  }
}
