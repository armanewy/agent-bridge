import { HandoffSchema, type Capture, type Handoff, type RedactionFinding, type StructuredHandoff } from "./types.js";

export interface CreateHandoffInput {
  id: string;
  missionId?: string;
  handoffCardId?: string;
  capture: Capture;
  targetId: string;
  transformId: string;
  prompt: string;
  redactionFindings?: RedactionFinding[];
  createdAt?: string;
}

export function createStructuredHandoff(capture: Capture, prompt: string): StructuredHandoff {
  return {
    goal: "Relay captured context to the selected target.",
    context: prompt,
    constraints: ["Keep data local unless the user explicitly sends it to the target."],
    acceptanceCriteria: ["The target receives the approved handoff text."],
    suggestedFiles: [],
    verificationSteps: ["Confirm the delivery result in AgentBridge audit history."],
    originalCaptureRef: capture.id
  };
}

export function createHandoff(input: CreateHandoffInput): Handoff {
  const handoff: Handoff = {
    id: input.id,
    ...(input.missionId ? { missionId: input.missionId } : {}),
    ...(input.handoffCardId ? { handoffCardId: input.handoffCardId } : {}),
    captureId: input.capture.id,
    sourceId: input.capture.sourceId,
    targetId: input.targetId,
    transformId: input.transformId,
    prompt: input.prompt,
    structured: createStructuredHandoff(input.capture, input.prompt),
    redactionFindings: input.redactionFindings ?? [],
    createdAt: input.createdAt ?? new Date().toISOString()
  };

  return HandoffSchema.parse(handoff);
}
