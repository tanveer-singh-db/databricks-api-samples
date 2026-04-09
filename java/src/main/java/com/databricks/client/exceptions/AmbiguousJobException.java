package com.databricks.client.exceptions;

import java.util.Map;

public class AmbiguousJobException extends DatabricksClientException {

    public AmbiguousJobException(String message, Map<String, Object> details) {
        super(message, details);
    }
}
