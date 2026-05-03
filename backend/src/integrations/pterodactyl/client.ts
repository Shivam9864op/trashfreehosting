export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PterodactylClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export class PterodactylApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = "PterodactylApiError";
  }
}

export class PterodactylClient {
  private readonly timeoutMs: number;
  private readonly baseHeaders: Record<string, string>;

  constructor(private readonly config: PterodactylClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.baseHeaders = {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": config.userAgent ?? "trashfreehosting-provisioner/1.0",
    };
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
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
        throw new PterodactylApiError(
          `Pterodactyl API request failed: ${response.status}`,
          response.status,
          payload
        );
      }

      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, params?: ApiRequestOptions["params"]): string {
    const normalizedBase = this.config.baseUrl.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${normalizedBase}${normalizedPath}`);

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    return url.toString();
  }
}
