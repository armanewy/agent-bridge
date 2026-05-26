import { HandoffSchema } from "./types.js";
export function createStructuredHandoff(capture, prompt) {
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
export function createHandoff(input) {
    const handoff = {
        id: input.id,
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
//# sourceMappingURL=handoff.js.map