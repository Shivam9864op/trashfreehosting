export class PterodactylServersApi {
    client;
    constructor(client) {
        this.client = client;
    }
    async createServer(payload) {
        const response = await this.client.request("/api/application/servers", { method: "POST", body: payload });
        return response.attributes;
    }
    async powerAction(serverIdentifier, signal) {
        await this.client.request(`/api/client/servers/${serverIdentifier}/power`, {
            method: "POST",
            body: { signal },
        });
    }
    async startServer(serverIdentifier) {
        return this.powerAction(serverIdentifier, "start");
    }
    async stopServer(serverIdentifier) {
        return this.powerAction(serverIdentifier, "stop");
    }
    async restartServer(serverIdentifier) {
        return this.powerAction(serverIdentifier, "restart");
    }
    async suspendServer(serverId) {
        await this.client.request(`/api/application/servers/${serverId}/suspend`, { method: "POST" });
    }
    async unsuspendServer(serverId) {
        await this.client.request(`/api/application/servers/${serverId}/unsuspend`, { method: "POST" });
    }
    async getServer(serverId) {
        const response = await this.client.request(`/api/application/servers/${serverId}`);
        return response.attributes;
    }
}
