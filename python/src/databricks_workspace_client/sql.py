"""SQL Statement Execution client — execute queries and handle chunked pagination."""

from __future__ import annotations

from collections.abc import Iterator

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import (
    Disposition,
    ExecuteStatementRequestOnWaitTimeout,
    Format,
    StatementParameterListItem,
    StatementResponse,
    StatementState,
)

from databricks_workspace_client.exceptions import QueryExecutionError
from databricks_workspace_client.models import ColumnInfo, QueryResult


def _parse_columns(response: StatementResponse) -> list[ColumnInfo]:
    """Extract column metadata from the statement response manifest."""
    if (
        not response.manifest
        or not response.manifest.schema
        or not response.manifest.schema.columns
    ):
        return []
    return [
        ColumnInfo(
            name=col.name or "",
            type_name=col.type_name.value if col.type_name else "",
            position=col.position or i,
        )
        for i, col in enumerate(response.manifest.schema.columns)
    ]


def _extract_rows(response: StatementResponse) -> list[list[str | None]]:
    """Extract data rows from the result chunk."""
    if not response.result or not response.result.data_array:
        return []
    return response.result.data_array


class SqlClient:
    """Client for Databricks SQL Statement Execution API."""

    def __init__(self, workspace_client: WorkspaceClient) -> None:
        self._ws = workspace_client

    def execute_query(
        self,
        statement: str,
        warehouse_id: str,
        *,
        catalog: str | None = None,
        schema: str | None = None,
        parameters: list[dict[str, str]] | None = None,
        row_limit: int | None = None,
        byte_limit: int | None = None,
    ) -> QueryResult:
        """Execute a SQL query and return all results eagerly.

        Automatically fetches all chunks if the result is paginated.

        Args:
            statement: SQL statement to execute (max 16 MiB).
            warehouse_id: Target SQL warehouse ID.
            catalog: Default catalog context.
            schema: Default schema context.
            parameters: Named parameters as ``[{"name": ..., "value": ..., "type": ...}]``.
            row_limit: Maximum rows to return.
            byte_limit: Maximum byte size of the result.

        Returns:
            Complete ``QueryResult`` with all rows.

        Raises:
            QueryExecutionError: If statement execution fails.
        """
        response = self._execute_statement(
            statement=statement,
            warehouse_id=warehouse_id,
            catalog=catalog,
            schema=schema,
            parameters=parameters,
            row_limit=row_limit,
            byte_limit=byte_limit,
        )

        columns = _parse_columns(response)
        all_rows = _extract_rows(response)

        # Fetch remaining chunks if paginated
        total_chunks = response.manifest.total_chunk_count if response.manifest else 1
        if total_chunks and total_chunks > 1 and response.statement_id:
            for chunk_idx in range(1, total_chunks):
                chunk_response = self._ws.statement_execution.get_statement_result_chunk_n(
                    statement_id=response.statement_id,
                    chunk_index=chunk_idx,
                )
                all_rows.extend(_extract_rows(chunk_response))

        return QueryResult(
            statement_id=response.statement_id or "",
            columns=columns,
            rows=all_rows,
            total_row_count=(
                response.manifest.total_row_count
                if response.manifest and response.manifest.total_row_count
                else len(all_rows)
            ),
            total_chunk_count=total_chunks or 1,
            truncated=bool(response.manifest and response.manifest.truncated),
        )

    def execute_query_lazy(
        self,
        statement: str,
        warehouse_id: str,
        *,
        catalog: str | None = None,
        schema: str | None = None,
        parameters: list[dict[str, str]] | None = None,
    ) -> Iterator[list[list[str | None]]]:
        """Execute a SQL query and yield results chunk by chunk.

        Memory-efficient for large result sets — only one chunk is held at a time.

        Args:
            statement: SQL statement to execute.
            warehouse_id: Target SQL warehouse ID.
            catalog: Default catalog context.
            schema: Default schema context.
            parameters: Named parameters.

        Yields:
            Lists of rows (each row is a list of string/None values) per chunk.

        Raises:
            QueryExecutionError: If statement execution fails.
        """
        response = self._execute_statement(
            statement=statement,
            warehouse_id=warehouse_id,
            catalog=catalog,
            schema=schema,
            parameters=parameters,
        )

        # Yield first chunk
        first_rows = _extract_rows(response)
        if first_rows:
            yield first_rows

        # Yield remaining chunks
        total_chunks = response.manifest.total_chunk_count if response.manifest else 1
        if total_chunks and total_chunks > 1 and response.statement_id:
            for chunk_idx in range(1, total_chunks):
                chunk_response = self._ws.statement_execution.get_statement_result_chunk_n(
                    statement_id=response.statement_id,
                    chunk_index=chunk_idx,
                )
                chunk_rows = _extract_rows(chunk_response)
                if chunk_rows:
                    yield chunk_rows

    def _execute_statement(
        self,
        statement: str,
        warehouse_id: str,
        *,
        catalog: str | None = None,
        schema: str | None = None,
        parameters: list[dict[str, str]] | None = None,
        row_limit: int | None = None,
        byte_limit: int | None = None,
    ) -> StatementResponse:
        """Execute a SQL statement and return the raw SDK response.

        Uses INLINE disposition with JSON_ARRAY format and waits up to 50s
        for the result before raising an error.
        """
        sdk_params = None
        if parameters:
            sdk_params = [
                StatementParameterListItem(
                    name=p["name"],
                    value=p["value"],
                    type=p.get("type"),
                )
                for p in parameters
            ]

        try:
            response = self._ws.statement_execution.execute_statement(
                statement=statement,
                warehouse_id=warehouse_id,
                catalog=catalog,
                schema=schema,
                disposition=Disposition.INLINE,
                format=Format.JSON_ARRAY,
                wait_timeout="50s",
                on_wait_timeout=ExecuteStatementRequestOnWaitTimeout.CANCEL,
                parameters=sdk_params,
                row_limit=row_limit,
                byte_limit=byte_limit,
            )
        except Exception as e:
            raise QueryExecutionError(
                f"Failed to execute SQL statement: {e}",
                details={"warehouse_id": warehouse_id},
            ) from e

        if response.status and response.status.state == StatementState.FAILED:
            error_msg = ""
            if response.status.error:
                error_msg = response.status.error.message or ""
            raise QueryExecutionError(
                f"SQL statement failed: {error_msg}",
                details={
                    "statement_id": response.statement_id,
                    "warehouse_id": warehouse_id,
                },
            )

        return response
