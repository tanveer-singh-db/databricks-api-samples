package com.databricks.client.models;

public record ColumnInfo(
        String name,
        String typeName,
        int position
) {}
