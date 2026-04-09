"""Tests for authentication configuration and factory."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from databricks_workspace_client.auth import AuthConfig, create_workspace_client
from databricks_workspace_client.exceptions import AuthenticationError


class TestAuthConfig:
    def test_all_defaults_are_none(self) -> None:
        config = AuthConfig()
        assert config.host is None
        assert config.token is None
        assert config.profile is None
        assert config.auth_type is None

    def test_explicit_values(self) -> None:
        config = AuthConfig(host="https://my-workspace.cloud.databricks.com", token="dapi123")
        assert config.host == "https://my-workspace.cloud.databricks.com"
        assert config.token == "dapi123"


class TestCreateWorkspaceClient:
    @patch("databricks_workspace_client.auth.WorkspaceClient")
    def test_none_config_uses_default_credentials(self, mock_ws_cls: MagicMock) -> None:
        mock_ws_cls.return_value = MagicMock()
        client = create_workspace_client(None)
        mock_ws_cls.assert_called_once_with()
        assert client is mock_ws_cls.return_value

    @patch("databricks_workspace_client.auth.WorkspaceClient")
    def test_explicit_config_passes_non_none_kwargs(self, mock_ws_cls: MagicMock) -> None:
        mock_ws_cls.return_value = MagicMock()
        config = AuthConfig(host="https://example.com", token="dapi-xyz")
        create_workspace_client(config)
        call_kwargs = mock_ws_cls.call_args[1]
        assert call_kwargs["host"] == "https://example.com"
        assert call_kwargs["token"] == "dapi-xyz"
        # None fields should be filtered out
        assert "profile" not in call_kwargs
        assert "azure_client_id" not in call_kwargs

    @patch("databricks_workspace_client.auth.WorkspaceClient")
    def test_azure_config_passes_through(self, mock_ws_cls: MagicMock) -> None:
        mock_ws_cls.return_value = MagicMock()
        config = AuthConfig(
            host="https://adb-123.azuredatabricks.net",
            azure_client_id="app-id",
            azure_client_secret="secret",
            azure_tenant_id="tenant-id",
        )
        create_workspace_client(config)
        call_kwargs = mock_ws_cls.call_args[1]
        assert call_kwargs["azure_client_id"] == "app-id"
        assert call_kwargs["azure_client_secret"] == "secret"
        assert call_kwargs["azure_tenant_id"] == "tenant-id"

    @patch("databricks_workspace_client.auth.WorkspaceClient")
    def test_auth_error_wraps_as_authentication_error(self, mock_ws_cls: MagicMock) -> None:
        # Simulate an authentication failure with a class name containing "auth"
        class UnauthenticatedError(Exception):
            pass

        mock_ws_cls.side_effect = UnauthenticatedError("bad token")
        with pytest.raises(AuthenticationError, match="Failed to authenticate"):
            create_workspace_client(AuthConfig(host="https://x.com", token="bad"))

    @patch("databricks_workspace_client.auth.WorkspaceClient")
    def test_non_auth_error_propagates(self, mock_ws_cls: MagicMock) -> None:
        mock_ws_cls.side_effect = ConnectionError("network down")
        with pytest.raises(ConnectionError, match="network down"):
            create_workspace_client(None)
