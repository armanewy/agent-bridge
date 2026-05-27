import { describe, expect, it } from "vitest";
import { createCloudApp } from "../src/index.js";

describe("AgentBridge Cloud scaffold", () => {
  it("responds to health checks", async () => {
    const app = createTestCloudApp();

    const response = await app.handle({ method: "GET", path: "/health" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("supports development login and user lookup", async () => {
    const app = createTestCloudApp();

    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);
    const me = await app.handle({ method: "GET", path: "/v1/me", headers: { authorization: `Bearer ${token}` } });

    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: "user_dev" });
  });

  it("disables development login unless explicitly configured", async () => {
    const app = createCloudApp({ allowDevLogin: false });

    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });

    expect(login.status).toBe(404);
  });

  it("rejects authenticated routes without a token", async () => {
    const app = createTestCloudApp();

    const response = await app.handle({ method: "GET", path: "/v1/me" });

    expect(response.status).toBe(401);
  });

  it("logs requests without raw request bodies", async () => {
    const app = createTestCloudApp();
    const login = await app.handle({
      method: "POST",
      path: "/v1/auth/session/dev-login",
      body: { secret: "do not log this" }
    });
    const token = String(login.body.token);

    await app.handle({
      method: "GET",
      path: "/v1/usage/me",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(JSON.stringify(app.getRequestLogs())).not.toContain("do not log this");
    expect(app.getRequestLogs().map((entry) => entry.route)).toEqual([
      "POST /v1/auth/session/dev-login",
      "GET /v1/usage/me"
    ]);
  });

  it("supports logout", async () => {
    const app = createTestCloudApp();
    const login = await app.handle({ method: "POST", path: "/v1/auth/session/dev-login" });
    const token = String(login.body.token);

    const logout = await app.handle({
      method: "POST",
      path: "/v1/auth/session/logout",
      headers: { authorization: `Bearer ${token}` }
    });
    const me = await app.handle({ method: "GET", path: "/v1/me", headers: { authorization: `Bearer ${token}` } });

    expect(logout.status).toBe(200);
    expect(me.status).toBe(401);
  });
});

function createTestCloudApp(config: Parameters<typeof createCloudApp>[0] = {}) {
  return createCloudApp({ allowDevLogin: true, ...config });
}
