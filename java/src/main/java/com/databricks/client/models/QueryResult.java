package com.databricks.client.models;

import java.util.List;

public record QueryResult(
        String statementId,
        List<ColumnInfo> columns,
        List<List<String>> rows,
        long totalRowCount,
        int totalChunkCount,
        boolean truncated
) {}
