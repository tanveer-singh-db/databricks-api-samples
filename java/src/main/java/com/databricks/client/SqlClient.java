package com.databricks.client;

import com.databricks.client.exceptions.QueryExecutionException;
import com.databricks.client.models.ColumnInfo;
import com.databricks.client.models.QueryResult;
import com.databricks.sdk.service.sql.*;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Client for Databricks SQL Statement Execution API.
 */
public class SqlClient {

    private final StatementExecutionAPI stmtApi;

    public SqlClient(StatementExecutionAPI stmtApi) {
        this.stmtApi = stmtApi;
    }

    // ─── Helpers ──────────────────────────────────────────────────

    private static List<ColumnInfo> parseColumns(StatementResponse response) {
        if (response.getManifest() == null || response.getManifest().getSchema() == null
                || response.getManifest().getSchema().getColumns() == null) {
            return List.of();
        }
        var columns = new ArrayList<>(response.getManifest().getSchema().getColumns());
        var result = new ArrayList<ColumnInfo>();
        for (int i = 0; i < columns.size(); i++) {
            var col = columns.get(i);
            result.add(new ColumnInfo(
                    col.getName() != null ? col.getName() : "",
                    col.getTypeName() != null ? col.getTypeName().toString() : "",
                    col.getPosition() != null ? col.getPosition().intValue() : i
            ));
        }
        return result;
    }

    private static List<List<String>> convertRows(Collection<? extends Collection<String>> dataArray) {
        if (dataArray == null) return new ArrayList<>();
        return dataArray.stream()
                .map(row -> new ArrayList<>(row))
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private static List<List<String>> extractRows(StatementResponse response) {
        if (response.getResult() == null || response.getResult().getDataArray() == null) {
            return new ArrayList<>();
        }
        return convertRows(response.getResult().getDataArray());
    }

    // ─── Public API ───────────────────────────────────────────────

    public QueryResult executeQuery(String statement, String warehouseId, SqlQueryOptions options) {
        StatementResponse response = executeStatement(statement, warehouseId, options);

        List<ColumnInfo> columns = parseColumns(response);
        List<List<String>> allRows = extractRows(response);

        // Fetch remaining chunks if paginated
        int totalChunks = response.getManifest() != null && response.getManifest().getTotalChunkCount() != null
                ? response.getManifest().getTotalChunkCount().intValue() : 1;

        if (totalChunks > 1 && response.getStatementId() != null) {
            for (long i = 1; i < totalChunks; i++) {
                var chunk = stmtApi.getStatementResultChunkN(
                        new GetStatementResultChunkNRequest()
                                .setStatementId(response.getStatementId())
                                .setChunkIndex(i)
                );
                if (chunk.getDataArray() != null) {
                    allRows.addAll(convertRows(chunk.getDataArray()));
                }
            }
        }

        long totalRowCount = response.getManifest() != null && response.getManifest().getTotalRowCount() != null
                ? response.getManifest().getTotalRowCount() : allRows.size();
        boolean truncated = response.getManifest() != null && Boolean.TRUE.equals(response.getManifest().getTruncated());

        return new QueryResult(
                response.getStatementId() != null ? response.getStatementId() : "",
                columns,
                allRows,
                totalRowCount,
                totalChunks,
                truncated
        );
    }

    public QueryResult executeQuery(String statement, String warehouseId) {
        return executeQuery(statement, warehouseId, null);
    }

    public Iterator<List<List<String>>> executeQueryLazy(String statement, String warehouseId, SqlQueryOptions options) {
        StatementResponse response = executeStatement(statement, warehouseId, options);
        int totalChunks = response.getManifest() != null && response.getManifest().getTotalChunkCount() != null
                ? response.getManifest().getTotalChunkCount().intValue() : 1;
        String statementId = response.getStatementId();

        return new Iterator<>() {
            private int nextChunk = 0;
            private final int total = totalChunks;
            private List<List<String>> firstRows = extractRows(response);

            @Override
            public boolean hasNext() {
                if (firstRows != null && !firstRows.isEmpty()) return true;
                return nextChunk < total;
            }

            @Override
            public List<List<String>> next() {
                if (firstRows != null && !firstRows.isEmpty()) {
                    var rows = firstRows;
                    firstRows = null;
                    nextChunk = 1;
                    return rows;
                }
                if (nextChunk >= total) {
                    throw new NoSuchElementException();
                }
                var chunk = stmtApi.getStatementResultChunkN(
                        new GetStatementResultChunkNRequest()
                                .setStatementId(statementId)
                                .setChunkIndex((long) nextChunk)
                );
                nextChunk++;
                return chunk.getDataArray() != null ? convertRows(chunk.getDataArray()) : List.of();
            }
        };
    }

    public Iterator<List<List<String>>> executeQueryLazy(String statement, String warehouseId) {
        return executeQueryLazy(statement, warehouseId, null);
    }

    // ─── Internal ─────────────────────────────────────────────────

    private StatementResponse executeStatement(String statement, String warehouseId, SqlQueryOptions options) {
        var request = new ExecuteStatementRequest()
                .setStatement(statement)
                .setWarehouseId(warehouseId)
                .setDisposition(Disposition.INLINE)
                .setFormat(Format.JSON_ARRAY)
                .setWaitTimeout("50s")
                .setOnWaitTimeout(ExecuteStatementRequestOnWaitTimeout.CANCEL);

        if (options != null) {
            if (options.catalog() != null) request.setCatalog(options.catalog());
            if (options.schema() != null) request.setSchema(options.schema());
            if (options.rowLimit() != null) request.setRowLimit(options.rowLimit());
            if (options.byteLimit() != null) request.setByteLimit(options.byteLimit());
            if (options.parameters() != null) {
                var sdkParams = options.parameters().stream()
                        .map(p -> new StatementParameterListItem()
                                .setName(p.get("name"))
                                .setValue(p.get("value"))
                                .setType(p.get("type")))
                        .collect(Collectors.toList());
                request.setParameters(sdkParams);
            }
        }

        StatementResponse response;
        try {
            response = stmtApi.executeStatement(request);
        } catch (Exception e) {
            throw new QueryExecutionException(
                    "Failed to execute SQL statement: " + e.getMessage(),
                    Map.of("warehouseId", warehouseId),
                    e
            );
        }

        if (response.getStatus() != null && response.getStatus().getState() == StatementState.FAILED) {
            String errorMsg = response.getStatus().getError() != null
                    ? response.getStatus().getError().getMessage() : "Unknown error";
            throw new QueryExecutionException(
                    "SQL statement failed: " + errorMsg,
                    Map.of("statementId", response.getStatementId() != null ? response.getStatementId() : "",
                            "warehouseId", warehouseId)
            );
        }

        return response;
    }
}
