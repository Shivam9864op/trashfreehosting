import { PterodactylClient } from "./client";

interface AttributesEnvelope<T> {
  attributes: T;
}

export interface PanelServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  node: number;
  limits: {
    memory: number;
    cpu: number;
    disk: number;
  };
}

export interface CreateServerPayload {
  name: string;
  user: number;
  egg: number;
  docker_image: string;
  startup: string;
  environment: Record<string, string>;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
  deploy: {
    locations: number[];
    dedicated_ip: boolean;
    port_range: string[];
  };
}

export class PterodactylServersApi {
  constructor(private readonly client: PterodactylClient) {}

  async createServer(payload: CreateServerPayload): Promise<PanelServer> {
    const response = await this.client.request<{ object: "server"; attributes: PanelServer }>(
      "/api/application/servers",
      { method: "POST", body: payload }
    );
    return response.attributes;
  }

  async powerAction(serverIdentifier: string, signal: "start" | "stop" | "restart" | "kill"): Promise<void> {
    await this.client.request(`/api/client/servers/${serverIdentifier}/power`, {
      method: "POST",
      body: { signal },
    });
  }

  async startServer(serverIdentifier: string): Promise<void> {
    return this.powerAction(serverIdentifier, "start");
  }

  async stopServer(serverIdentifier: string): Promise<void> {
    return this.powerAction(serverIdentifier, "stop");
  }

  async restartServer(serverIdentifier: string): Promise<void> {
    return this.powerAction(serverIdentifier, "restart");
  }

  async suspendServer(serverId: number): Promise<void> {
    await this.client.request(`/api/application/servers/${serverId}/suspend`, { method: "POST" });
  }

  async unsuspendServer(serverId: number): Promise<void> {
    await this.client.request(`/api/application/servers/${serverId}/unsuspend`, { method: "POST" });
  }

  async getServer(serverId: number): Promise<PanelServer> {
    const response = await this.client.request<AttributesEnvelope<PanelServer>>(
      `/api/application/servers/${serverId}`
    );
    return response.attributes;
  }
}
