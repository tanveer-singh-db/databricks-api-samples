package com.databricks.client.exceptions;

import java.util.Map;

public class JobRunException extends DatabricksClientException {

    public JobRunException(String message, Map<String, Object> details) {
        super(message, details);
    }
}
