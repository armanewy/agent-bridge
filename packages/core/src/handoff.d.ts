import { type Capture, type Handoff, type RedactionFinding, type StructuredHandoff } from "./types.js";
export interface CreateHandoffInput {
    id: string;
    capture: Capture;
    targetId: string;
    transformId: string;
    prompt: string;
    redactionFindings?: RedactionFinding[];
    createdAt?: string;
}
export declare function createStructuredHandoff(capture: Capture, prompt: string): StructuredHandoff;
export declare function createHandoff(input: CreateHandoffInput): Handoff;
//# sourceMappingURL=handoff.d.ts.map