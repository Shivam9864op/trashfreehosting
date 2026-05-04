export class PterodactylApiError extends Error {
    status;
    payload;
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
        this.name = "PterodactylApiError";
    }
}
export class PterodactylClient {
    config;
    timeoutMs;
    baseHeaders;
    constructor(config) {
        this.config = config;
        this.timeoutMs = config.timeoutMs ?? 10_000;
        this.baseHeaders = {
            Accept: "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": config.userAgent ?? "trashfreehosting-provisioner/1.0",
        };
    }
    async request(path, options = {}) {
        const url = this.buildUrl(path, options.params);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                method: options.method ?? "GET",
                headers: { ...this.baseHeaders, ...options.headers },
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: controller.signal,
            });
            const contentType = response.headers.get("content-type") || "";
            const payload = contentType.includes("application/json")
                ? await response.json()
                : await response.text();
            if (!response.ok) {
                throw new PterodactylApiError(`Pterodactyl API request failed: ${response.status}`, response.status, payload);
            }
            return payload;
        }
        finally {
            clearTimeout(timer);
        }
    }
    buildUrl(path, params) {
        const normalizedBase = this.config.baseUrl.replace(/\/$/, "");
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const url = new URL(`${normalizedBase}${normalizedPath}`);
        for (const [key, value] of Object.entries(params ?? {})) {
            if (value === undefined)
                continue;
            url.searchParams.set(key, String(value));
        }
        return url.toString();
    }
}
