package com.databricks.client;

import java.util.List;
import java.util.Map;

/**
 * Options for SQL query execution.
 */
public record SqlQueryOptions(
        String catalog,
        String schema,
        List<Map<String, String>> parameters,
        Long rowLimit,
        Long byteLimit
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String catalog;
        private String schema;
        private List<Map<String, String>> parameters;
        private Long rowLimit;
        private Long byteLimit;

        public Builder catalog(String catalog) { this.catalog = catalog; return this; }
        public Builder schema(String schema) { this.schema = schema; return this; }
        public Builder parameters(List<Map<String, String>> parameters) { this.parameters = parameters; return this; }
        public Builder rowLimit(Long rowLimit) { this.rowLimit = rowLimit; return this; }
        public Builder byteLimit(Long byteLimit) { this.byteLimit = byteLimit; return this; }

        public SqlQueryOptions build() {
            return new SqlQueryOptions(catalog, schema, parameters, rowLimit, byteLimit);
        }
    }
}
