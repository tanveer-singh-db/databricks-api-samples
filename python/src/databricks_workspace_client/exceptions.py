"""Custom exception hierarchy for DatabricksWorkspaceClient.

Each exception wraps the original SDK exception as __cause__ via `raise ... from`,
preserving full debuggability while providing a cross-language-consistent error interface.
"""

from __future__ import annotations


class DatabricksClientError(Exception):
    """Base exception for all DatabricksWorkspaceClient errors."""

    def __init__(self, message: str, *, details: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.details = details or {}


class AuthenticationError(DatabricksClientError):
    """Failed to authenticate with the Databricks workspace."""


class ResourceNotFoundError(DatabricksClientError):
    """Requested resource (job, run, warehouse, etc.) was not found."""


class PermissionDeniedError(DatabricksClientError):
    """Caller lacks permission for the requested operation."""


class QueryExecutionError(DatabricksClientError):
    """SQL statement execution failed."""


class JobRunError(DatabricksClientError):
    """Job run failed or reached an unexpected terminal state."""


class OperationTimeoutError(DatabricksClientError):
    """Operation exceeded the configured timeout."""


class AmbiguousJobError(DatabricksClientError):
    """Job name matched multiple jobs. Provide a more specific name or use job_id."""
