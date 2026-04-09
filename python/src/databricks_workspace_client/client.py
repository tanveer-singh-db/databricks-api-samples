"""DatabricksWorkspaceClient — facade composing auth, jobs, and SQL clients."""

from __future__ import annotations

from databricks.sdk import WorkspaceClient

from databricks_workspace_client.auth import AuthConfig, create_workspace_client
from databricks_workspace_client.jobs import JobsClient
from databricks_workspace_client.sql import SqlClient


class DatabricksWorkspaceClient:
    """High-level client for Databricks workspace operations.

    Composes domain-specific clients (jobs, sql) behind a single entry point.
    Authentication is resolved once at construction time.

    Usage::

        from databricks_workspace_client import DatabricksWorkspaceClient

        # Uses env vars / .databrickscfg / cloud-native auth automatically
        client = DatabricksWorkspaceClient()

        # Or with explicit config
        from databricks_workspace_client import AuthConfig
        client = DatabricksWorkspaceClient(AuthConfig(host="https://...", token="dapi..."))

        # Use domain clients
        jobs = client.jobs.list_jobs(name="my-etl-job")
        result = client.sql.execute_query("SELECT 1", warehouse_id="abc123")
    """

    def __init__(self, config: AuthConfig | None = None) -> None:
        self._ws = create_workspace_client(config)
        self.jobs = JobsClient(self._ws)
        self.sql = SqlClient(self._ws)

    @property
    def workspace_client(self) -> WorkspaceClient:
        """Access the underlying SDK ``WorkspaceClient`` for operations not yet wrapped."""
        return self._ws
