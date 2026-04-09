package com.databricks.client.models;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RunStatusTest {

    @Test
    void terminatedIsTerminal() {
        var status = new RunStatus(1, "TERMINATED", "SUCCESS", null);
        assertTrue(status.isTerminal());
    }

    @Test
    void skippedIsTerminal() {
        var status = new RunStatus(1, "SKIPPED", null, null);
        assertTrue(status.isTerminal());
    }

    @Test
    void internalErrorIsTerminal() {
        var status = new RunStatus(1, "INTERNAL_ERROR", null, null);
        assertTrue(status.isTerminal());
    }

    @Test
    void runningIsNotTerminal() {
        var status = new RunStatus(1, "RUNNING", null, null);
        assertFalse(status.isTerminal());
    }

    @Test
    void pendingIsNotTerminal() {
        var status = new RunStatus(1, "PENDING", null, null);
        assertFalse(status.isTerminal());
    }

    @Test
    void defaultsNullFields() {
        var status = new RunStatus(42, "RUNNING", null, null);
        assertNull(status.resultState());
        assertNull(status.stateMessage());
    }
}
