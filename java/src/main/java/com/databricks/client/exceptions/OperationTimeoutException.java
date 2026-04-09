package com.databricks.client.exceptions;

import java.util.Map;

public class OperationTimeoutException extends DatabricksClientException {

    public OperationTimeoutException(String message, Map<String, Object> details, Throwable cause) {
        super(message, details, cause);
    }
}
