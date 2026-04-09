"""Tests for the DatabricksWorkspaceClient facade."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from databricks_workspace_client.client import DatabricksWorkspaceClient
from databricks_workspace_client.jobs import JobsClient
from databricks_workspace_client.sql import SqlClient


class TestDatabricksWorkspaceClient:
    @patch("databricks_workspace_client.client.create_workspace_client")
    def test_creates_domain_clients(self, mock_factory: MagicMock) -> None:
        mock_factory.return_value = MagicMock()
        client = DatabricksWorkspaceClient()
        assert isinstance(client.jobs, JobsClient)
        assert isinstance(client.sql, SqlClient)

    @patch("databricks_workspace_client.client.create_workspace_client")
    def test_workspace_client_property(self, mock_factory: MagicMock) -> None:
        mock_ws = MagicMock()
        mock_factory.return_value = mock_ws
        client = DatabricksWorkspaceClient()
        assert client.workspace_client is mock_ws

    @patch("databricks_workspace_client.client.create_workspace_client")
    def test_passes_config_to_factory(self, mock_factory: MagicMock) -> None:
        from databricks_workspace_client.auth import AuthConfig

        mock_factory.return_value = MagicMock()
        config = AuthConfig(host="https://example.com", token="dapi123")
        DatabricksWorkspaceClient(config)
        mock_factory.assert_called_once_with(config)
