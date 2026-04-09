package com.databricks.client;

import java.util.List;
import java.util.Map;

/**
 * Parameters for triggering a job run.
 * Use {@link #builder()} for convenient construction.
 */
public record TriggerParams(
        Map<String, String> notebookParams,
        Map<String, String> jobParameters,
        List<String> pythonParams,
        Map<String, String> pythonNamedParams,
        List<String> jarParams,
        Map<String, String> sqlParams,
        String idempotencyToken
) {
    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Map<String, String> notebookParams;
        private Map<String, String> jobParameters;
        private List<String> pythonParams;
        private Map<String, String> pythonNamedParams;
        private List<String> jarParams;
        private Map<String, String> sqlParams;
        private String idempotencyToken;

        public Builder notebookParams(Map<String, String> notebookParams) {
            this.notebookParams = notebookParams;
            return this;
        }

        public Builder jobParameters(Map<String, String> jobParameters) {
            this.jobParameters = jobParameters;
            return this;
        }

        public Builder pythonParams(List<String> pythonParams) {
            this.pythonParams = pythonParams;
            return this;
        }

        public Builder pythonNamedParams(Map<String, String> pythonNamedParams) {
            this.pythonNamedParams = pythonNamedParams;
            return this;
        }

        public Builder jarParams(List<String> jarParams) {
            this.jarParams = jarParams;
            return this;
        }

        public Builder sqlParams(Map<String, String> sqlParams) {
            this.sqlParams = sqlParams;
            return this;
        }

        public Builder idempotencyToken(String idempotencyToken) {
            this.idempotencyToken = idempotencyToken;
            return this;
        }

        public TriggerParams build() {
            return new TriggerParams(
                    notebookParams, jobParameters, pythonParams,
                    pythonNamedParams, jarParams, sqlParams, idempotencyToken
            );
        }
    }
}
