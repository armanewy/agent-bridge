import { randomUUID } from "node:crypto";
import type { AgentBridgeCloudAuthStatus } from "@agentbridge/core";

export interface AgentBridgeUser {
  id: string;
  email?: string;
}

export interface AgentBridgeAuthStatus {
  status: AgentBridgeCloudAuthStatus;
  signedIn: boolean;
  cloudBaseUrl: string;
  mode: "development" | "production";
  user?: AgentBridgeUser;
  error?: string;
}

export interface AuthStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AuthTransport {
  request<T>(path: string, input: { method: string; token?: string; body?: unknown }): Promise<T>;
}

export class AuthService {
  constructor(
    private readonly storage: AuthStorage = new MemoryAuthStorage(),
    private cloudBaseUrl = process.env.AGENTBRIDGE_CLOUD_URL ?? "http://127.0.0.1:8787",
    private readonly mode: "development" | "production" = process.env.NODE_ENV === "production" ? "production" : "development",
    private readonly transport?: AuthTransport
  ) {}

  async getAuthStatus(): Promise<AgentBridgeAuthStatus> {
    const token = await this.getAuthToken();
    if (!token) {
      return { status: "signedOut", signedIn: false, cloudBaseUrl: this.cloudBaseUrl, mode: this.mode };
    }
    try {
      const user = await this.getCurrentUser();
      return { status: "signedIn", signedIn: true, cloudBaseUrl: this.cloudBaseUrl, mode: this.mode, ...(user ? { user } : {}) };
    } catch (error) {
      return {
        status: "unavailable",
        signedIn: false,
        cloudBaseUrl: this.cloudBaseUrl,
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async signInDevMode(): Promise<AgentBridgeAuthStatus> {
    if (this.transport) {
      const result = await this.transport.request<{ token: string; user?: AgentBridgeUser }>("/v1/auth/session/dev-login", {
        method: "POST"
      });
      await this.storage.set("agentbridge.cloud.token", result.token);
      if (result.user) {
        await this.storage.set("agentbridge.cloud.user", JSON.stringify(result.user));
      }
      return this.getAuthStatus();
    }
    const token = `dev_local_${randomUUID()}`;
    await this.storage.set("agentbridge.cloud.token", token);
    await this.storage.set("agentbridge.cloud.user", JSON.stringify({ id: "user_dev", email: "dev@agentbridge.local" }));
    return this.getAuthStatus();
  }

  async signOut(): Promise<AgentBridgeAuthStatus> {
    const token = await this.getAuthToken();
    if (token && this.transport) {
      await this.transport.request("/v1/auth/session/logout", { method: "POST", token });
    }
    await this.storage.delete("agentbridge.cloud.token");
    await this.storage.delete("agentbridge.cloud.user");
    return this.getAuthStatus();
  }

  async getCurrentUser(): Promise<AgentBridgeUser | undefined> {
    const token = await this.getAuthToken();
    if (!token) {
      return undefined;
    }
    if (this.transport) {
      const result = await this.transport.request<{ user?: AgentBridgeUser }>("/v1/me", { method: "GET", token });
      return result.user;
    }
    const raw = await this.storage.get("agentbridge.cloud.user");
    return raw ? JSON.parse(raw) as AgentBridgeUser : { id: "user_dev" };
  }

  getAuthToken(): Promise<string | undefined> {
    return this.storage.get("agentbridge.cloud.token");
  }

  getCloudBaseUrl(): string {
    return this.cloudBaseUrl;
  }

  setCloudBaseUrl(url: string): Promise<AgentBridgeAuthStatus> {
    if (!/^https?:\/\//.test(url)) {
      throw new Error("AgentBridge Cloud URL must start with http:// or https://.");
    }
    this.cloudBaseUrl = url.replace(/\/+$/, "");
    return this.getAuthStatus();
  }
}

export class MemoryAuthStorage implements AuthStorage {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export class FetchAuthTransport implements AuthTransport {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, input: { method: string; token?: string; body?: unknown }): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      method: input.method,
      headers: {
        "content-type": "application/json",
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {})
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
    });
    if (!response.ok) {
      throw new Error(`AgentBridge Cloud returned HTTP ${response.status}.`);
    }
    return await response.json() as T;
  }
}
