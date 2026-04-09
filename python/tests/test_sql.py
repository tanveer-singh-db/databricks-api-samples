"""Tests for SqlClient."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from databricks.sdk.service.sql import (
    ResultData,
    ResultManifest,
    ResultSchema,
    StatementResponse,
    StatementState,
    StatementStatus,
)

from databricks_workspace_client.exceptions import QueryExecutionError
from databricks_workspace_client.sql import SqlClient


def _make_column(name: str, type_name: str, position: int) -> MagicMock:
    col = MagicMock()
    col.name = name
    type_mock = MagicMock()
    type_mock.value = type_name
    col.type_name = type_mock
    col.position = position
    return col


def _make_response(
    statement_id: str = "stmt-1",
    state: StatementState = StatementState.SUCCEEDED,
    columns: list[MagicMock] | None = None,
    data_array: list[list[str | None]] | None = None,
    total_chunk_count: int = 1,
    total_row_count: int | None = None,
    truncated: bool = False,
) -> MagicMock:
    if data_array is None:
        data_array = [["1", "alice"], ["2", "bob"]]

    response = MagicMock(spec=StatementResponse)
    response.statement_id = statement_id

    response.status = MagicMock(spec=StatementStatus)
    response.status.state = state
    response.status.error = None

    response.manifest = MagicMock(spec=ResultManifest)
    response.manifest.total_chunk_count = total_chunk_count
    response.manifest.total_row_count = (
        total_row_count if total_row_count is not None else len(data_array)
    )
    response.manifest.truncated = truncated

    schema = MagicMock(spec=ResultSchema)
    schema.columns = columns or [_make_column("id", "INT", 0), _make_column("name", "STRING", 1)]
    response.manifest.schema = schema

    response.result = MagicMock(spec=ResultData)
    response.result.data_array = data_array

    return response


def _make_chunk_response(data_array: list[list[str | None]]) -> MagicMock:
    response = MagicMock(spec=StatementResponse)
    response.result = MagicMock(spec=ResultData)
    response.result.data_array = data_array
    return response


class TestExecuteQuery:
    def test_single_chunk(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[["1", "alice"], ["2", "bob"]],
            total_row_count=2,
        )
        client = SqlClient(mock_ws)
        result = client.execute_query("SELECT * FROM users", warehouse_id="wh-1")

        assert result.statement_id == "stmt-1"
        assert len(result.columns) == 2
        assert result.columns[0].name == "id"
        assert result.columns[1].name == "name"
        assert len(result.rows) == 2
        assert result.rows[0] == ["1", "alice"]
        assert result.total_row_count == 2
        assert result.truncated is False

    def test_multi_chunk_pagination(self, mock_ws: MagicMock) -> None:
        # First chunk has 2 rows, second chunk has 2 rows, third has 1
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[["1", "a"], ["2", "b"]],
            total_chunk_count=3,
            total_row_count=5,
        )
        mock_ws.statement_execution.get_statement_result_chunk_n.side_effect = [
            _make_chunk_response([["3", "c"], ["4", "d"]]),
            _make_chunk_response([["5", "e"]]),
        ]
        client = SqlClient(mock_ws)
        result = client.execute_query("SELECT * FROM big_table", warehouse_id="wh-1")

        assert len(result.rows) == 5
        assert result.rows[4] == ["5", "e"]
        assert result.total_chunk_count == 3
        # Verify chunk fetching calls
        assert mock_ws.statement_execution.get_statement_result_chunk_n.call_count == 2

    def test_passes_parameters(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[["42"]]
        )
        client = SqlClient(mock_ws)
        client.execute_query(
            "SELECT :id",
            warehouse_id="wh-1",
            catalog="main",
            schema="default",
            parameters=[{"name": "id", "value": "42", "type": "INT"}],
        )
        call_kwargs = mock_ws.statement_execution.execute_statement.call_args[1]
        assert call_kwargs["catalog"] == "main"
        assert call_kwargs["schema"] == "default"
        assert len(call_kwargs["parameters"]) == 1

    def test_execution_error(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.side_effect = Exception("warehouse offline")
        client = SqlClient(mock_ws)
        with pytest.raises(QueryExecutionError, match="Failed to execute"):
            client.execute_query("SELECT 1", warehouse_id="wh-bad")

    def test_failed_statement_raises(self, mock_ws: MagicMock) -> None:
        response = _make_response(state=StatementState.FAILED)
        error_mock = MagicMock()
        error_mock.message = "syntax error at line 1"
        response.status.error = error_mock
        mock_ws.statement_execution.execute_statement.return_value = response

        client = SqlClient(mock_ws)
        with pytest.raises(QueryExecutionError, match="syntax error"):
            client.execute_query("SELCT 1", warehouse_id="wh-1")


class TestExecuteQueryLazy:
    def test_yields_chunks(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[["1", "a"]],
            total_chunk_count=2,
        )
        mock_ws.statement_execution.get_statement_result_chunk_n.return_value = (
            _make_chunk_response([["2", "b"]])
        )
        client = SqlClient(mock_ws)
        chunks = list(client.execute_query_lazy("SELECT * FROM t", warehouse_id="wh-1"))

        assert len(chunks) == 2
        assert chunks[0] == [["1", "a"]]
        assert chunks[1] == [["2", "b"]]

    def test_single_chunk_yields_once(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[["1"]],
            total_chunk_count=1,
        )
        client = SqlClient(mock_ws)
        chunks = list(client.execute_query_lazy("SELECT 1", warehouse_id="wh-1"))
        assert len(chunks) == 1
        # No chunk fetching should happen
        mock_ws.statement_execution.get_statement_result_chunk_n.assert_not_called()

    def test_empty_result(self, mock_ws: MagicMock) -> None:
        mock_ws.statement_execution.execute_statement.return_value = _make_response(
            data_array=[],
            total_chunk_count=1,
        )
        client = SqlClient(mock_ws)
        chunks = list(client.execute_query_lazy("SELECT * FROM empty", warehouse_id="wh-1"))
        assert chunks == []
