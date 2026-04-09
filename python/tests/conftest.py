"""Shared test fixtures for DatabricksWorkspaceClient tests."""

from __future__ import annotations

from unittest.mock import MagicMock, create_autospec

import pytest
from databricks.sdk import WorkspaceClient


@pytest.fixture
def mock_ws() -> MagicMock:
    """Return a MagicMock with WorkspaceClient's spec."""
    return create_autospec(WorkspaceClient, instance=True)
