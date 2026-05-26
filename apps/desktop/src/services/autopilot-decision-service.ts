import { decideAutopilot, type AutopilotDecisionInput } from "@agentbridge/core";

export class AutopilotDecisionService {
  decide(input: AutopilotDecisionInput) {
    return decideAutopilot(input);
  }
}
