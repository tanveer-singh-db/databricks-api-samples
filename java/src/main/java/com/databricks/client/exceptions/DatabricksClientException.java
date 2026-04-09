package com.databricks.client.exceptions;

import java.util.Map;

public class DatabricksClientException extends RuntimeException {

    private final Map<String, Object> details;

    public DatabricksClientException(String message) {
        this(message, Map.of(), null);
    }

    public DatabricksClientException(String message, Map<String, Object> details) {
        this(message, details, null);
    }

    public DatabricksClientException(String message, Map<String, Object> details, Throwable cause) {
        super(message, cause);
        this.details = details != null ? details : Map.of();
    }

    public Map<String, Object> getDetails() {
        return details;
    }
}
