import { describe, expect, it } from "vitest";
import {
  canAutonomouslyPass,
  evaluateCompletionContract,
  validateCompletionContract,
  type CompletionContract,
  type CompletionEvidence
} from "../src/index.js";

describe("completion contracts", () => {
  const now = new Date().toISOString();

  it("validates objective textual contracts", () => {
    const contract = contractFixture({
      acceptanceCriteria: [
        {
          id: "criterion_text",
          statement: "The Workbench title says AgentBridge.",
          evidenceRequired: "Textual UI evidence.",
          verifierKind: "textual",
          required: true
        }
      ],
      verificationMethods: [
        {
          id: "method_text",
          kind: "textual",
          description: "Inspect rendered text.",
          expectedText: "AgentBridge"
        }
      ]
    });

    const validated = validateCompletionContract(contract);

    expect(validated.status).toBe("valid");
    expect(canAutonomouslyPass(validated)).toBe(true);
  });

  it("marks missing objective verification as needing input", () => {
    const contract = contractFixture({
      acceptanceCriteria: [
        {
          id: "criterion_visual",
          statement: "The default window fits at 760x940 without horizontal scroll.",
          evidenceRequired: "Screenshot or layout artifact.",
          verifierKind: "visual",
          required: true
        }
      ],
      verificationMethods: []
    });

    const validated = validateCompletionContract(contract);

    expect(validated.status).toBe("needs_user_input");
    expect(canAutonomouslyPass(validated)).toBe(false);
  });

  it("does not allow human-review-only contracts to autonomously pass", () => {
    const contract = validateCompletionContract(
      contractFixture({
        acceptanceCriteria: [
          {
            id: "criterion_review",
            statement: "The UI feels better.",
            evidenceRequired: "Human review.",
            verifierKind: "humanReview",
            required: true
          }
        ],
        verificationMethods: [
          {
            id: "method_review",
            kind: "humanReview",
            description: "Arman reviews the result."
          }
        ]
      })
    );
    const evidence: CompletionEvidence[] = [
      {
        id: "evidence_review",
        contractId: contract.id,
        criterionId: "criterion_review",
        kind: "humanReview",
        status: "passed",
        summary: "Human reviewer accepted it.",
        createdAt: now
      }
    ];

    const result = evaluateCompletionContract(contract, evidence, now);

    expect(contract.status).toBe("valid");
    expect(canAutonomouslyPass(contract)).toBe(false);
    expect(result.status).toBe("needs_review");
  });

  it("requires evidence for required criteria", () => {
    const contract = validateCompletionContract(contractFixture());
    const result = evaluateCompletionContract(contract, [], now);

    expect(result.status).toBe("needs_review");
    expect(result.criterionResults[0]?.status).toBe("unknown");
  });

  function contractFixture(overrides: Partial<CompletionContract> = {}): CompletionContract {
    return {
      id: "contract_1",
      missionId: "mission_1",
      goal: "Make Workbench compact at 760x940.",
      scope: ["Workbench UI"],
      nonGoals: [],
      acceptanceCriteria: [
        {
          id: "criterion_1",
          statement: "The app opens at 760x940.",
          evidenceRequired: "Textual or screenshot evidence.",
          verifierKind: "textual",
          required: true
        }
      ],
      verificationMethods: [
        {
          id: "method_1",
          kind: "textual",
          description: "Check window dimensions."
        }
      ],
      stopConditions: [],
      humanReviewTriggers: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ...overrides
    };
  }
});
