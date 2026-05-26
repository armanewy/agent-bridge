import { describe, expect, it } from "vitest";
import { createCloudApp } from "../src/index.js";

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
    const app = createCloudApp();
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

  it("does not store raw request bodies in request logs", async () => {
    const app = createCloudApp();
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
});
