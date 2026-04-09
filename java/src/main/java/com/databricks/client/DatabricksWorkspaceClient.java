package com.databricks.client;

import com.databricks.client.exceptions.AuthenticationException;
import com.databricks.sdk.WorkspaceClient;

import java.util.Map;

/**
 * High-level client for Databricks workspace operations.
 * Composes domain-specific clients (jobs, sql) behind a single entry point.
 * Authentication is resolved once at construction time.
 *
 * <pre>
 * // Uses env vars / .databrickscfg / cloud-native auth automatically
 * var client = new DatabricksWorkspaceClient();
 *
 * // Or with explicit config
 * var client = new DatabricksWorkspaceClient(
 *     new AuthConfig().setHost("https://...").setToken("dapi...")
 * );
 *
 * // Use domain clients
 * var jobs = client.jobs().listJobs();
 * var result = client.sql().executeQuery("SELECT 1", "warehouseId");
 * </pre>
 */
public class DatabricksWorkspaceClient {

    private final WorkspaceClient ws;
    private final JobsClient jobs;
    private final SqlClient sql;

    public DatabricksWorkspaceClient() {
        this(null);
    }

    public DatabricksWorkspaceClient(AuthConfig config) {
        try {
            this.ws = config != null
                    ? new WorkspaceClient(config.toDatabricksConfig())
                    : new WorkspaceClient();
        } catch (Exception e) {
            String errorType = e.getClass().getSimpleName().toLowerCase();
            if (errorType.contains("auth") || errorType.contains("unauth")) {
                throw new AuthenticationException(
                        "Failed to authenticate: " + e.getMessage(),
                        Map.of("originalError", e.getClass().getSimpleName()),
                        e
                );
            }
            throw e;
        }
        this.jobs = new JobsClient(ws.jobs());
        this.sql = new SqlClient(ws.statementExecution());
    }

    public JobsClient jobs() {
        return jobs;
    }

    public SqlClient sql() {
        return sql;
    }

    public WorkspaceClient workspaceClient() {
        return ws;
    }
}
