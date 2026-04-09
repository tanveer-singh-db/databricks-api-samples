"""Authentication configuration and WorkspaceClient factory.

Provides a thin AuthConfig dataclass whose fields map 1:1 to the SDK's Config kwargs.
The factory function handles the "if None → use unified default credentials" path.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from databricks.sdk import WorkspaceClient

from databricks_workspace_client.exceptions import AuthenticationError


@dataclass
class AuthConfig:
    """Configuration for authenticating with a Databricks workspace.

    Fields map directly to ``databricks.sdk.WorkspaceClient`` constructor kwargs.
    Leave all fields as ``None`` to use unified default credentials
    (environment variables → .databrickscfg → cloud-native auth).
    """

    # Core
    host: str | None = None
    token: str | None = None
    profile: str | None = None
    auth_type: str | None = None

    # OAuth M2M (service principal)
    client_id: str | None = None
    client_secret: str | None = None

    # Azure-specific
    azure_client_id: str | None = None
    azure_client_secret: str | None = None
    azure_tenant_id: str | None = None
    azure_workspace_resource_id: str | None = None
    azure_use_msi: bool | None = None

    # GCP-specific
    google_credentials: str | None = None
    google_service_account: str | None = None

    # SDK behavior
    http_timeout_seconds: int | None = None
    retry_timeout_seconds: int | None = None


def create_workspace_client(config: AuthConfig | None = None) -> WorkspaceClient:
    """Create an authenticated ``WorkspaceClient``.

    Args:
        config: Authentication configuration. If ``None``, the SDK resolves
            credentials automatically via environment variables, config profiles,
            or cloud-native auth (Azure CLI, GCP default credentials, etc.).

    Returns:
        An authenticated ``WorkspaceClient`` instance.

    Raises:
        AuthenticationError: If authentication fails.
    """
    try:
        if config is None:
            return WorkspaceClient()
        kwargs = {k: v for k, v in asdict(config).items() if v is not None}
        return WorkspaceClient(**kwargs)
    except Exception as e:
        error_type = type(e).__name__
        if "auth" in error_type.lower() or "unauth" in error_type.lower():
            raise AuthenticationError(
                f"Failed to authenticate: {e}",
                details={"original_error": error_type},
            ) from e
        raise
