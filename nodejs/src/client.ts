/**
 * DatabricksWorkspaceClient — facade composing auth, jobs, and SQL clients.
 */

import type { AuthConfig } from "./auth.ts";
import { resolveAuth } from "./auth.ts";
import { HttpClient } from "./http.ts";
import { JobsClient } from "./jobs.ts";
import { SqlClient } from "./sql.ts";

export class DatabricksWorkspaceClient {
  readonly jobs: JobsClient;
  readonly sql: SqlClient;

  constructor(config?: AuthConfig) {
    const { host, tokenProvider } = resolveAuth(config);
    const http = new HttpClient({
      host,
      tokenProvider,
      timeoutMs: config?.httpTimeoutSeconds
        ? config.httpTimeoutSeconds * 1000
        : undefined,
    });
    this.jobs = new JobsClient(http);
    this.sql = new SqlClient(http);
  }
}
