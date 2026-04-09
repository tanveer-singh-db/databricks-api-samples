package com.databricks.client.models;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RunResultTest {

    @Test
    void isSuccessTrue() {
        var result = new RunResult(1, "TERMINATED", "SUCCESS", null, null, null, null, null);
        assertTrue(result.isSuccess());
    }

    @Test
    void isSuccessFalse() {
        var result = new RunResult(1, "TERMINATED", "FAILED", null, null, null, null, null);
        assertFalse(result.isSuccess());
    }

    @Test
    void isTerminal() {
        var result = new RunResult(1, "TERMINATED", null, null, null, null, null, null);
        assertTrue(result.isTerminal());
    }

    @Test
    void optionalFieldsDefaultNull() {
        var result = new RunResult(1, "RUNNING", null, null, null, null, null, null);
        assertNull(result.startTime());
        assertNull(result.endTime());
        assertNull(result.runDuration());
        assertNull(result.runPageUrl());
    }
}
