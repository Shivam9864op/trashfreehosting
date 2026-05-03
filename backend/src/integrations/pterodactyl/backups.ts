import { PterodactylClient } from "./client";

export interface ServerBackup {
  uuid: string;
  name: string;
  ignored_files: string;
  checksum?: string;
  bytes: number;
  completed_at?: string;
  created_at: string;
}

export class PterodactylBackupsApi {
  constructor(private readonly client: PterodactylClient) {}

  async createBackup(serverIdentifier: string, name: string, ignoredFiles = ""): Promise<ServerBackup> {
    const response = await this.client.request<{ attributes: ServerBackup }>(
      `/api/client/servers/${serverIdentifier}/backups`,
      {
        method: "POST",
        body: { name, ignored: ignoredFiles },
      }
    );

    return response.attributes;
  }

  async listBackups(serverIdentifier: string): Promise<ServerBackup[]> {
    const response = await this.client.request<{ data: Array<{ attributes: ServerBackup }> }>(
      `/api/client/servers/${serverIdentifier}/backups`
    );
    return response.data.map((item) => item.attributes);
  }

  async restoreBackup(serverIdentifier: string, backupUuid: string): Promise<void> {
    await this.client.request(`/api/client/servers/${serverIdentifier}/backups/${backupUuid}/restore`, {
      method: "POST",
    });
  }
}
