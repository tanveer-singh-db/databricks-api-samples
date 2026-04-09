/**
 * Internal HTTP client using built-in fetch().
 *
 * Handles authentication headers, timeout, error mapping, and retry logic.
 * Zero third-party dependencies.
 */

import {
  AuthenticationError,
  DatabricksClientError,
  PermissionDeniedError,
  ResourceNotFoundError,
} from "./exceptions.ts";

/** Token provider interface — implemented by auth providers. */
export interface TokenProvider {
  getToken(): Promise<string>;
}

/** Public interface for HTTP operations — used by JobsClient/SqlClient. */
export interface IHttpClient {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

interface HttpClientOptions {
  host: string;
  tokenProvider: TokenProvider;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface ApiErrorBody {
  message?: string;
  error_code?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapHttpError(
  status: number,
  body: ApiErrorBody,
  url: string,
): DatabricksClientError {
  const msg = body.message ?? `HTTP ${status}`;
  const details = { errorCode: body.error_code, url };

  switch (status) {
    case 401:
      return new AuthenticationError(msg, { details });
    case 403:
      return new PermissionDeniedError(msg, { details });
    case 404:
      return new ResourceNotFoundError(msg, { details });
    default:
      return new DatabricksClientError(msg, { details });
  }
}

export class HttpClient implements IHttpClient {
  private readonly host: string;
  private readonly tokenProvider: TokenProvider;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: HttpClientOptions) {
    this.host = options.host.replace(/\/+$/, "");
    this.tokenProvider = options.tokenProvider;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.host}${path}`;
    if (params) {
      const filtered = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== ""),
      );
      if (Object.keys(filtered).length > 0) {
        url += `?${new URLSearchParams(filtered).toString()}`;
      }
    }
    return this.request<T>(url, "GET");
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.host}${path}`;
    return this.request<T>(url, "POST", body);
  }

  private async request<T>(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const token = await this.tokenProvider.getToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          "User-Agent": "databricks-workspace-client-nodejs/0.1.0",
        };

        const init: RequestInit = {
          method,
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
        };

        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(body);
        }

        const response = await fetch(url, init);

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Parse error body
        let errorBody: ApiErrorBody = {};
        try {
          errorBody = (await response.json()) as ApiErrorBody;
        } catch {
          // Response body not JSON — use status text
        }

        // Retry on 429 or 5xx
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt < this.maxRetries
        ) {
          const retryAfter = response.headers.get("Retry-After");
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : this.retryDelayMs * Math.pow(2, attempt);
          await delay(delayMs);
          continue;
        }

        throw mapHttpError(response.status, errorBody, url);
      } catch (err) {
        if (err instanceof DatabricksClientError) {
          throw err;
        }
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          await delay(this.retryDelayMs * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw new DatabricksClientError(
      `Request to ${url} failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      { cause: lastError },
    );
  }
}
