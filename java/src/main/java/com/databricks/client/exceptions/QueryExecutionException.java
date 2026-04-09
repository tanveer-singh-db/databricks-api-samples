package com.databricks.client.exceptions;

import java.util.Map;

public class QueryExecutionException extends DatabricksClientException {

    public QueryExecutionException(String message, Map<String, Object> details) {
        super(message, details);
    }

    public QueryExecutionException(String message, Map<String, Object> details, Throwable cause) {
        super(message, details, cause);
    }
}
