"""DatabricksWorkspaceClient — a clean wrapper around the Databricks SDK."""

from databricks_workspace_client.auth import AuthConfig
from databricks_workspace_client.client import DatabricksWorkspaceClient
from databricks_workspace_client.exceptions import (
    AmbiguousJobError,
    AuthenticationError,
    DatabricksClientError,
    JobRunError,
    OperationTimeoutError,
    PermissionDeniedError,
    QueryExecutionError,
    ResourceNotFoundError,
)
from databricks_workspace_client.models import (
    ColumnInfo,
    JobInfo,
    QueryResult,
    RunResult,
    RunStatus,
)

__all__ = [
    "AmbiguousJobError",
    "AuthConfig",
    "AuthenticationError",
    "ColumnInfo",
    "DatabricksClientError",
    "DatabricksWorkspaceClient",
    "JobInfo",
    "JobRunError",
    "OperationTimeoutError",
    "PermissionDeniedError",
    "QueryExecutionError",
    "QueryResult",
    "ResourceNotFoundError",
    "RunResult",
    "RunStatus",
]
