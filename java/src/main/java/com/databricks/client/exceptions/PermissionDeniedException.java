package com.databricks.client.exceptions;

import java.util.Map;

public class PermissionDeniedException extends DatabricksClientException {

    public PermissionDeniedException(String message, Map<String, Object> details, Throwable cause) {
        super(message, details, cause);
    }
}
