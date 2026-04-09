package com.databricks.client.exceptions;

import java.util.Map;

public class AuthenticationException extends DatabricksClientException {

    public AuthenticationException(String message) {
        super(message);
    }

    public AuthenticationException(String message, Map<String, Object> details, Throwable cause) {
        super(message, details, cause);
    }
}
