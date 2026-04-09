package com.databricks.client.exceptions;

import java.util.Map;

public class ResourceNotFoundException extends DatabricksClientException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String message, Map<String, Object> details) {
        super(message, details);
    }

    public ResourceNotFoundException(String message, Map<String, Object> details, Throwable cause) {
        super(message, details, cause);
    }
}
