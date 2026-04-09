package com.databricks.client.models;

import java.util.Set;

public record RunStatus(
        long runId,
        String lifecycleState,
        String resultState,
        String stateMessage
) {
    private static final Set<String> TERMINAL_STATES = Set.of(
            "TERMINATED", "SKIPPED", "INTERNAL_ERROR"
    );

    public boolean isTerminal() {
        return TERMINAL_STATES.contains(lifecycleState);
    }
}
