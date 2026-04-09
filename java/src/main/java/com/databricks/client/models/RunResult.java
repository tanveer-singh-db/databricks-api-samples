package com.databricks.client.models;

import java.util.Set;

public record RunResult(
        long runId,
        String lifecycleState,
        String resultState,
        String stateMessage,
        Long startTime,
        Long endTime,
        Long runDuration,
        String runPageUrl
) {
    private static final Set<String> TERMINAL_STATES = Set.of(
            "TERMINATED", "SKIPPED", "INTERNAL_ERROR"
    );

    public boolean isTerminal() {
        return TERMINAL_STATES.contains(lifecycleState);
    }

    public boolean isSuccess() {
        return "SUCCESS".equals(resultState);
    }
}
