package com.databricks.client;

import com.databricks.client.exceptions.*;
import com.databricks.client.models.RunResult;
import com.databricks.sdk.core.error.platform.NotFound;
import com.databricks.sdk.core.error.platform.PermissionDenied;
import com.databricks.sdk.service.jobs.*;
import com.databricks.sdk.support.Wait;
import com.databricks.sdk.support.WaitStarter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JobsClientTest {

    @Mock
    private JobsAPI jobsApi;

    private JobsClient client;

    @BeforeEach
    void setUp() {
        client = new JobsClient(jobsApi);
    }

    private static BaseJob makeBaseJob(long jobId, String name) {
        var settings = new JobSettings().setName(name);
        return new BaseJob().setJobId(jobId).setSettings(settings)
                .setCreatedTime(1700000000L).setCreatorUserName("user@example.com");
    }

    private static Run makeRun(long runId, String lifecycleState, String resultState) {
        var state = new RunState()
                .setLifeCycleState(RunLifeCycleState.valueOf(lifecycleState));
        if (resultState != null) {
            state.setResultState(RunResultState.valueOf(resultState));
        }
        return new Run().setRunId(runId).setState(state)
                .setStartTime(1700000000L).setEndTime(1700000060L)
                .setExecutionDuration(60000L).setRunPageUrl("https://ws.com/runs/" + runId);
    }

    private Wait<Run, RunNowResponse> createWait(long runId) {
        var response = new RunNowResponse().setRunId(runId);
        WaitStarter<Run> starter = (duration, callback) -> makeRun(runId, "TERMINATED", "SUCCESS");
        return new Wait<>(starter, response);
    }

    @Nested
    class ListJobsTests {
        @Test
        void returnsJobInfo() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(1, "etl"), makeBaseJob(2, "ml")));
            var jobs = client.listJobs();
            assertEquals(2, jobs.size());
            assertEquals(1, jobs.get(0).jobId());
            assertEquals("etl", jobs.get(0).name());
        }

        @Test
        void respectsLimit() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(1, "a"), makeBaseJob(2, "b"), makeBaseJob(3, "c")));
            var jobs = client.listJobs(null, false, 2);
            assertEquals(2, jobs.size());
        }
    }

    @Nested
    class TriggerTests {
        @Test
        void returnsRunId() {
            when(jobsApi.runNow(any(RunNow.class))).thenReturn(createWait(42));
            long runId = client.trigger(123, TriggerParams.builder().jobParameters(Map.of("env", "prod")).build());
            assertEquals(42, runId);
        }

        @Test
        void notFoundThrows() {
            when(jobsApi.runNow(any(RunNow.class))).thenThrow(new NotFound("not found", null));
            assertThrows(ResourceNotFoundException.class, () -> client.trigger(999));
        }

        @Test
        void permissionDeniedThrows() {
            when(jobsApi.runNow(any(RunNow.class))).thenThrow(new PermissionDenied("denied", null));
            assertThrows(PermissionDeniedException.class, () -> client.trigger(1));
        }
    }

    @Nested
    class GetRunStatusTests {
        @Test
        void returnsRunStatus() {
            when(jobsApi.getRun(any(GetRunRequest.class))).thenReturn(makeRun(42, "RUNNING", null));
            var status = client.getRunStatus(42);
            assertEquals(42, status.runId());
            assertEquals("RUNNING", status.lifecycleState());
            assertFalse(status.isTerminal());
        }

        @Test
        void terminalState() {
            when(jobsApi.getRun(any(GetRunRequest.class))).thenReturn(makeRun(42, "TERMINATED", "SUCCESS"));
            var status = client.getRunStatus(42);
            assertTrue(status.isTerminal());
            assertEquals("SUCCESS", status.resultState());
        }
    }

    @Nested
    class ResolveJobTests {
        @Test
        void resolveByJobId() {
            assertEquals(42, client.resolveJob(42L, null));
        }

        @Test
        void resolveExactMatch() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(10, "etl-daily")));
            assertEquals(10, client.resolveJob(null, "etl-daily"));
        }

        @Test
        void resolvePartialMatch() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of())
                    .thenReturn(List.of(makeBaseJob(1, "other"), makeBaseJob(2, "my-etl-pipeline")));
            assertEquals(2, client.resolveJob(null, "etl"));
        }

        @Test
        void noMatchThrows() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of())
                    .thenReturn(List.of(makeBaseJob(1, "other")));
            assertThrows(ResourceNotFoundException.class, () -> client.resolveJob(null, "ghost"));
        }

        @Test
        void ambiguousThrows() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(1, "etl"), makeBaseJob(2, "etl")));
            var ex = assertThrows(AmbiguousJobException.class, () -> client.resolveJob(null, "etl"));
            assertTrue(ex.getMessage().contains("matched 2 jobs"));
        }

        @Test
        void neitherProvidedThrows() {
            assertThrows(DatabricksClientException.class, () -> client.resolveJob(null, null));
        }
    }

    @Nested
    class FindAndTriggerTests {
        @Test
        void fireAndForget() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(10, "my-job")));
            when(jobsApi.runNow(any(RunNow.class))).thenReturn(createWait(42));
            when(jobsApi.getRun(any(GetRunRequest.class))).thenReturn(makeRun(42, "PENDING", null));

            RunResult result = client.findAndTrigger(null, "my-job", null, false);
            assertEquals(42, result.runId());
            assertEquals("PENDING", result.lifecycleState());
        }

        @Test
        void byJobId() {
            when(jobsApi.runNow(any(RunNow.class))).thenReturn(createWait(77));
            when(jobsApi.getRun(any(GetRunRequest.class))).thenReturn(makeRun(77, "PENDING", null));

            RunResult result = client.findAndTrigger(10L, null, null, false);
            assertEquals(77, result.runId());
        }

        @Test
        void notFoundThrows() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of())
                    .thenReturn(List.of());
            assertThrows(ResourceNotFoundException.class,
                    () -> client.findAndTrigger(null, "ghost", null, false));
        }

        @Test
        void ambiguousThrows() {
            when(jobsApi.list(any(ListJobsRequest.class)))
                    .thenReturn(List.of(makeBaseJob(1, "etl"), makeBaseJob(2, "etl")));
            assertThrows(AmbiguousJobException.class,
                    () -> client.findAndTrigger(null, "etl", null, false));
        }
    }
}
