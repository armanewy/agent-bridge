import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AuthService, FileAuthStorage, MemoryAuthStorage, type AuthTransport } from "../src/services/auth-service.js";

describe("AuthService", () => {
  it("is signed out by default", async () => {
    const service = new AuthService(new MemoryAuthStorage());

    const status = await service.getAuthStatus();

    expect(status.status).toBe("signedOut");
    expect(status.signedIn).toBe(false);
  });

  it("stores a development token on dev sign-in", async () => {
    const service = new AuthService(new MemoryAuthStorage());

    const status = await service.signInDevMode();

    expect(status.status).toBe("signedIn");
    await expect(service.getAuthToken()).resolves.toMatch(/^dev_local_/);
  });

  it("clears token on sign-out", async () => {
    const service = new AuthService(new MemoryAuthStorage());
    await service.signInDevMode();

    const status = await service.signOut();

    expect(status.status).toBe("signedOut");
    await expect(service.getAuthToken()).resolves.toBeUndefined();
  });

  it("persists development auth tokens across service instances", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agentbridge-auth-"));
    try {
      const authPath = join(tempDir, "auth.json");
      const first = new AuthService(new FileAuthStorage(authPath));
      await first.signInDevMode();

      const second = new AuthService(new FileAuthStorage(authPath));

      await expect(second.getAuthStatus()).resolves.toMatchObject({
        status: "signedIn",
        signedIn: true
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports unavailable when the cloud cannot return the current user", async () => {
    const transport: AuthTransport = {
      async request(path) {
        if (path === "/v1/auth/session/dev-login") {
          return { token: "dev_token" } as never;
        }
        throw new Error("cloud offline");
      }
    };
    const service = new AuthService(new MemoryAuthStorage(), "http://127.0.0.1:8787", "development", transport);

    const status = await service.signInDevMode();

    expect(status.status).toBe("unavailable");
    expect(status.error).toContain("cloud offline");
  });
});
