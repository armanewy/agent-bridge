import { describe, expect, it } from "vitest";
import { createCloudApp, type CloudPlannerRequest, type CloudPlannerTransport } from "../src/index.js";

describe("AgentBridge Cloud scaffold", () => {
  it("responds to health checks", async () => {
    const app = createCloudApp();

    const response = await app.handle({ method: "GET", path: "/health" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("rejects unauthenticated planner routes", async () => {
    const app = createCloudApp();

    const response = await app.handle({ method: "POST", path: "/v1/planner/task-spec", body: {} });

    expect(response.status).toBe(401);
  });

  it("supports development login and user lookup", async () => {
    const app = createCloudApp();

    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);
    const me = await app.handle({ method: "GET", path: "/v1/me", headers: { authorization: `Bearer ${token}` } });

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: "user_dev" });
  });

  it("returns a valid mocked task spec", async () => {
    const app = createCloudApp({}, { plannerTransport: mockPlannerTransport(JSON.stringify(mockTaskSpec())) });
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    const response = await app.handle({
      method: "POST",
      path: "/v1/planner/task-spec",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { intent: "Simplify Workbench." } }
    });

    expect(response.status).toBe(200);
    expect(response.body.taskSpec).toMatchObject({ title: "Mock hosted planner TaskSpec" });
  });

  it("repairs an invalid task spec response once", async () => {
    const requests: CloudPlannerRequest[] = [];
    const app = createCloudApp(
      {},
      {
        plannerTransport: {
          async createResponse(request) {
            requests.push(request);
            return {
              responseId: `resp_${requests.length}`,
              outputText: requests.length === 1 ? "not json" : JSON.stringify(mockTaskSpec())
            };
          }
        }
      }
    );
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    const response = await app.handle({
      method: "POST",
      path: "/v1/planner/task-spec",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { intent: "Simplify Workbench." } }
    });

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(response.body.metadata).toMatchObject({ repaired: true });
  });

  it("returns hosted review JSON from the planner transport", async () => {
    const app = createCloudApp(
      {},
      {
        plannerTransport: mockPlannerTransport(JSON.stringify({
          reviewSummary: "Verification passed.",
          statusSuggestion: "passed"
        }))
      }
    );
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    const response = await app.handle({
      method: "POST",
      path: "/v1/planner/review",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { verificationSummary: "pnpm test passed" }, missionId: "mission_1" }
    });

    expect(response.status).toBe(200);
    expect(response.body.statusSuggestion).toBe("passed");
  });

  it("returns unavailable when no server-side planner transport or OpenAI key exists", async () => {
    const app = createCloudApp({ openAiApiKey: undefined, openAiApiKeyConfigured: false });
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    const response = await app.handle({
      method: "POST",
      path: "/v1/planner/task-spec",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { intent: "Plan." } }
    });

    expect(response.status).toBe(503);
    expect(String(response.body.error)).toContain("OPENAI_API_KEY");
  });

  it("does not store raw request bodies in request logs", async () => {
    const app = createCloudApp({}, { plannerTransport: mockPlannerTransport("Planner response.") });
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    await app.handle({
      method: "POST",
      path: "/v1/planner/sessions",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { intent: "secret prompt text" } }
    });

    expect(JSON.stringify(app.getRequestLogs())).not.toContain("secret prompt text");
  });

  it("records usage without raw prompt text", async () => {
    const app = createCloudApp({}, { plannerTransport: mockPlannerTransport("Planner response.") });
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);
    await app.handle({
      method: "POST",
      path: "/v1/planner/sessions",
      headers: { authorization: `Bearer ${token}` },
      body: { payload: { intent: "do not store this prompt" } }
    });

    expect(JSON.stringify(app.getUsageRecords())).not.toContain("do not store this prompt");
    expect(app.getUsageRecords()[0]).toMatchObject({ route: "/v1/planner/sessions", status: 200 });
  });
});

function mockPlannerTransport(outputText: string): CloudPlannerTransport {
  return {
    async createResponse() {
      return {
        responseId: "resp_mock",
        outputText,
        usage: { inputTokens: 10, outputTokens: 20 },
        metadata: { transport: "mock" }
      };
    }
  };
}

function mockTaskSpec() {
  return {
    title: "Mock hosted planner TaskSpec",
    goal: "Demonstrate the hosted planner contract.",
    background: "Cloud planner routes are backed by an injectable transport in tests.",
    instructions: ["Keep the task scoped."],
    requirements: ["No repo files are required by default."],
    constraints: ["Do not upload repo content."],
    nonGoals: ["Do not implement additional providers."],
    acceptanceCriteria: ["A valid TaskSpec is returned."],
    suggestedFiles: [],
    verificationSteps: [],
    expectedSummaryFormat: "Summary, changed files, verification."
  };
}
