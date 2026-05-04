export class PterodactylBackupsApi {
    client;
    constructor(client) {
        this.client = client;
    }
    async createBackup(serverIdentifier, name, ignoredFiles = "") {
        const response = await this.client.request(`/api/client/servers/${serverIdentifier}/backups`, {
            method: "POST",
            body: { name, ignored: ignoredFiles },
        });
        return response.attributes;
    }
    async listBackups(serverIdentifier) {
        const response = await this.client.request(`/api/client/servers/${serverIdentifier}/backups`);
        return response.data.map((item) => item.attributes);
    }
    async restoreBackup(serverIdentifier, backupUuid) {
        await this.client.request(`/api/client/servers/${serverIdentifier}/backups/${backupUuid}/restore`, {
            method: "POST",
        });
    }
}
