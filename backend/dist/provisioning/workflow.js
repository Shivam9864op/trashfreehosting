import { Queue, Worker, QueueEvents } from "bullmq";
import { PterodactylClient } from "../integrations/pterodactyl/client";
import { PterodactylServersApi } from "../integrations/pterodactyl/servers";
import { resolveEggTemplate, resolveResourceLimits } from "../integrations/pterodactyl/mapping";
export class RedisProvisioningQueue {
    queue;
    events;
    constructor(connection, queueName = "provisioning") {
        this.queue = new Queue(queueName, { connection });
        this.events = new QueueEvents(queueName, { connection });
    }
    async enqueue(request, options = {}) {
        await this.queue.add("provision", request, {
            attempts: 5,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
            ...options,
        });
    }
}
export function selectNode(candidates) {
    if (candidates.length === 0) {
        throw new Error("No candidate nodes are available");
    }
    return [...candidates].sort((a, b) => {
        const capacityScoreA = a.availableRamMb - a.cpuLoadPct * 32;
        const capacityScoreB = b.availableRamMb - b.cpuLoadPct * 32;
        const healthPenaltyA = a.latencyMs * 4 + a.failCount * 100;
        const healthPenaltyB = b.latencyMs * 4 + b.failCount * 100;
        return capacityScoreB - healthPenaltyB - (capacityScoreA - healthPenaltyA);
    })[0];
}
export function createProvisioningWorker(params) {
    const queueName = "provisioning";
    const deadLetter = new Queue(params.deadLetterQueueName ?? "provisioning-dlq", {
        connection: params.connection,
    });
    const serversApi = new PterodactylServersApi(new PterodactylClient({ ...params.pterodactyl, timeoutMs: 15_000 }));
    return new Worker(queueName, async (job) => {
        const { jobId } = job.data;
        try {
            await params.store.saveStatus(jobId, "running", { step: "select-node" });
            params.io.to(job.data.userId).emit("provisioning:update", { jobId, status: "running", step: "select-node" });
            const node = selectNode(job.data.locationCandidates);
            const limits = resolveResourceLimits(job.data.plan, job.data.boost);
            const template = resolveEggTemplate(job.data.game, job.data.edition);
            await params.store.saveStatus(jobId, "running", {
                step: "creating-server",
                nodeId: node.nodeId,
                limits,
            });
            params.io.to(job.data.userId).emit("provisioning:update", {
                jobId,
                status: "running",
                step: "creating-server",
                nodeId: node.nodeId,
            });
            const server = await serversApi.createServer({
                name: job.data.serverName,
                user: Number(job.data.userId),
                egg: template.eggId,
                docker_image: template.dockerImage,
                startup: template.startup,
                environment: template.environment,
                limits: {
                    memory: limits.ramMb,
                    swap: 0,
                    disk: limits.diskMb,
                    io: 500,
                    cpu: limits.cpuPercent,
                },
                feature_limits: { databases: 1, allocations: 1, backups: 2 },
                deploy: { locations: [node.nodeId], dedicated_ip: false, port_range: [] },
            });
            await params.store.saveStatus(jobId, "completed", { serverId: server.id, nodeId: node.nodeId });
            params.io.to(job.data.userId).emit("provisioning:update", {
                jobId,
                status: "completed",
                serverId: server.id,
            });
        }
        catch (error) {
            await params.store.saveStatus(jobId, "failed", {
                reason: error instanceof Error ? error.message : "Unknown error",
            });
            params.io.to(job.data.userId).emit("provisioning:update", {
                jobId,
                status: "failed",
                reason: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }, {
        connection: params.connection,
        settings: {
            backoffStrategy: (attemptsMade) => Math.min(60_000, 2 ** attemptsMade * 1_000),
        },
    }).on("failed", async (job) => {
        if (!job || job.attemptsMade < (job.opts.attempts ?? 1))
            return;
        await deadLetter.add("dead-provision", job.data, {
            removeOnComplete: 500,
            removeOnFail: 500,
        });
    });
}
