package com.databricks.client;

import com.databricks.client.exceptions.*;
import com.databricks.client.models.JobInfo;
import com.databricks.client.models.RunResult;
import com.databricks.client.models.RunStatus;
import com.databricks.sdk.core.error.platform.NotFound;
import com.databricks.sdk.core.error.platform.PermissionDenied;
import com.databricks.sdk.service.jobs.*;

import java.time.Duration;
import java.util.*;
import java.util.function.Consumer;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * Client for Databricks Jobs API operations.
 */
public class JobsClient {

    private static final Logger LOG = Logger.getLogger(JobsClient.class.getName());
    private final JobsAPI jobsApi;

    public JobsClient(JobsAPI jobsApi) {
        this.jobsApi = jobsApi;
    }

    // ─── Mappers ──────────────────────────────────────────────────

    private static JobInfo mapJob(BaseJob job) {
        var settings = job.getSettings();
        return new JobInfo(
                job.getJobId() != null ? job.getJobId() : 0L,
                settings != null && settings.getName() != null ? settings.getName() : "",
                job.getCreatedTime(),
                job.getCreatorUserName(),
                settings != null && settings.getTags() != null ? settings.getTags() : Map.of()
        );
    }

    private static RunStatus mapRunStatus(Run run) {
        var state = run.getState();
        return new RunStatus(
                run.getRunId() != null ? run.getRunId() : 0L,
                state != null && state.getLifeCycleState() != null ? state.getLifeCycleState().toString() : "",
                state != null && state.getResultState() != null ? state.getResultState().toString() : null,
                state != null ? state.getStateMessage() : null
        );
    }

    private static RunResult mapRunResult(Run run) {
        var state = run.getState();
        return new RunResult(
                run.getRunId() != null ? run.getRunId() : 0L,
                state != null && state.getLifeCycleState() != null ? state.getLifeCycleState().toString() : "",
                state != null && state.getResultState() != null ? state.getResultState().toString() : null,
                state != null ? state.getStateMessage() : null,
                run.getStartTime(),
                run.getEndTime(),
                run.getExecutionDuration(),
                run.getRunPageUrl()
        );
    }

    // ─── Public API ───────────────────────────────────────────────

    public List<JobInfo> listJobs(String name, boolean expandTasks, Integer limit) {
        try {
            var request = new ListJobsRequest().setExpandTasks(expandTasks);
            if (name != null) request.setName(name);

            Iterable<BaseJob> iterable = jobsApi.list(request);
            var jobs = StreamSupport.stream(iterable.spliterator(), false)
                    .map(JobsClient::mapJob)
                    .collect(Collectors.toList());

            if (limit != null && jobs.size() > limit) {
                return jobs.subList(0, limit);
            }
            return jobs;
        } catch (PermissionDenied e) {
            throw new PermissionDeniedException(
                    "Permission denied listing jobs: " + e.getMessage(),
                    Map.of("nameFilter", name != null ? name : ""),
                    e
            );
        }
    }

    public List<JobInfo> listJobs() {
        return listJobs(null, false, null);
    }

    public long trigger(long jobId, TriggerParams params) {
        try {
            var request = new RunNow().setJobId(jobId);
            if (params != null) {
                if (params.notebookParams() != null) request.setNotebookParams(params.notebookParams());
                if (params.jobParameters() != null) request.setJobParameters(params.jobParameters());
                if (params.pythonParams() != null) request.setPythonParams(params.pythonParams());
                if (params.pythonNamedParams() != null) request.setPythonNamedParams(params.pythonNamedParams());
                if (params.jarParams() != null) request.setJarParams(params.jarParams());
                if (params.sqlParams() != null) request.setSqlParams(params.sqlParams());
                if (params.idempotencyToken() != null) request.setIdempotencyToken(params.idempotencyToken());
            }
            var wait = jobsApi.runNow(request);
            return wait.getResponse().getRunId();
        } catch (NotFound e) {
            throw new ResourceNotFoundException(
                    "Job " + jobId + " not found: " + e.getMessage(),
                    Map.of("jobId", jobId),
                    e
            );
        } catch (PermissionDenied e) {
            throw new PermissionDeniedException(
                    "Permission denied triggering job " + jobId + ": " + e.getMessage(),
                    Map.of("jobId", jobId),
                    e
            );
        }
    }

    public long trigger(long jobId) {
        return trigger(jobId, null);
    }

    public RunStatus getRunStatus(long runId) {
        try {
            Run run = jobsApi.getRun(new GetRunRequest().setRunId(runId));
            return mapRunStatus(run);
        } catch (NotFound e) {
            throw new ResourceNotFoundException(
                    "Run " + runId + " not found: " + e.getMessage(),
                    Map.of("runId", runId),
                    e
            );
        }
    }

    public RunResult getRunResult(long runId) {
        try {
            Run run = jobsApi.getRun(new GetRunRequest().setRunId(runId));
            return mapRunResult(run);
        } catch (NotFound e) {
            throw new ResourceNotFoundException(
                    "Run " + runId + " not found: " + e.getMessage(),
                    Map.of("runId", runId),
                    e
            );
        }
    }

    public RunResult triggerAndWait(long jobId, TriggerParams params, Duration timeout,
                                    Consumer<RunStatus> pollCallback) {
        try {
            var request = new RunNow().setJobId(jobId);
            if (params != null) {
                if (params.notebookParams() != null) request.setNotebookParams(params.notebookParams());
                if (params.jobParameters() != null) request.setJobParameters(params.jobParameters());
                if (params.pythonParams() != null) request.setPythonParams(params.pythonParams());
                if (params.pythonNamedParams() != null) request.setPythonNamedParams(params.pythonNamedParams());
                if (params.jarParams() != null) request.setJarParams(params.jarParams());
                if (params.sqlParams() != null) request.setSqlParams(params.sqlParams());
                if (params.idempotencyToken() != null) request.setIdempotencyToken(params.idempotencyToken());
            }

            var wait = jobsApi.runNow(request);
            Run completedRun;
            if (timeout != null) {
                completedRun = wait.get(timeout);
            } else {
                completedRun = wait.get();
            }

            RunResult result = mapRunResult(completedRun);

            if (result.resultState() != null && !result.isSuccess()) {
                throw new JobRunException(
                        "Job " + jobId + " run " + result.runId() + " finished with state "
                                + result.resultState() + ": " + result.stateMessage(),
                        Map.of("jobId", jobId, "runId", result.runId(), "resultState", result.resultState())
                );
            }

            return result;
        } catch (NotFound e) {
            throw new ResourceNotFoundException(
                    "Job " + jobId + " not found: " + e.getMessage(),
                    Map.of("jobId", jobId),
                    e
            );
        } catch (PermissionDenied e) {
            throw new PermissionDeniedException(
                    "Permission denied triggering job " + jobId + ": " + e.getMessage(),
                    Map.of("jobId", jobId),
                    e
            );
        } catch (java.util.concurrent.TimeoutException e) {
            throw new OperationTimeoutException(
                    "Job " + jobId + " did not complete within " + timeout + ": " + e.getMessage(),
                    Map.of("jobId", jobId, "timeout", timeout.toString()),
                    e
            );
        } catch (JobRunException | ResourceNotFoundException | PermissionDeniedException | OperationTimeoutException e) {
            throw e;
        } catch (Exception e) {
            throw new DatabricksClientException(
                    "Error triggering job " + jobId + ": " + e.getMessage(),
                    Map.of("jobId", jobId),
                    e
            );
        }
    }

    public RunResult triggerAndWait(long jobId, TriggerParams params, Duration timeout) {
        return triggerAndWait(jobId, params, timeout, null);
    }

    public RunResult triggerAndWait(long jobId) {
        return triggerAndWait(jobId, null, Duration.ofMinutes(20), null);
    }

    // ─── Find and Trigger ─────────────────────────────────────────

    public long resolveJob(Long jobId, String jobName) {
        if (jobId != null) {
            LOG.info("[findAndTrigger] Using jobId=" + jobId + " directly");
            return jobId;
        }

        if (jobName == null) {
            throw new DatabricksClientException("Either jobId or jobName must be provided");
        }

        // 1. Exact match (API-side)
        LOG.info("[findAndTrigger] Searching for job with exact name: '" + jobName + "'");
        List<JobInfo> exactMatches = listJobs(jobName, false, null);
        if (exactMatches.size() == 1) {
            LOG.info("[findAndTrigger] Exact match found: [" + exactMatches.get(0).jobId() + "] " + exactMatches.get(0).name());
            return exactMatches.get(0).jobId();
        }
        if (exactMatches.size() > 1) {
            throwAmbiguous(jobName, exactMatches);
        }

        // 2. Partial match (client-side, capped at 1000)
        LOG.info("[findAndTrigger] No exact match. Searching partial match across workspace jobs...");
        List<JobInfo> allJobs = listJobs(null, false, 1000);
        String needle = jobName.toLowerCase();
        List<JobInfo> partial = allJobs.stream()
                .filter(j -> j.name().toLowerCase().contains(needle))
                .collect(Collectors.toList());

        if (partial.isEmpty()) {
            throw new ResourceNotFoundException(
                    "No job found matching '" + jobName + "' (searched " + allJobs.size() + " jobs)",
                    Map.of("jobName", jobName, "jobsSearched", allJobs.size())
            );
        }
        if (partial.size() == 1) {
            LOG.info("[findAndTrigger] Partial match found: [" + partial.get(0).jobId() + "] " + partial.get(0).name());
            return partial.get(0).jobId();
        }

        throwAmbiguous(jobName, partial);
        return 0; // unreachable
    }

    private void throwAmbiguous(String jobName, List<JobInfo> matches) {
        String jobList = matches.stream()
                .map(j -> "  [" + j.jobId() + "] " + j.name())
                .collect(Collectors.joining("\n"));
        List<Map<String, Object>> matchData = matches.stream()
                .map(j -> Map.<String, Object>of("jobId", j.jobId(), "name", j.name()))
                .collect(Collectors.toList());
        throw new AmbiguousJobException(
                "Job name '" + jobName + "' matched " + matches.size() + " jobs:\n" + jobList
                        + "\nPlease provide a more specific name or use jobId.",
                Map.of("jobName", jobName, "matches", matchData)
        );
    }

    public RunResult findAndTrigger(Long jobId, String jobName, TriggerParams params,
                                     boolean wait, Duration timeout, Consumer<RunStatus> pollCallback) {
        long resolvedId = resolveJob(jobId, jobName);
        LOG.info("[findAndTrigger] Triggering jobId=" + resolvedId + " (wait=" + wait + ")");

        if (wait) {
            RunResult result = triggerAndWait(resolvedId, params, timeout != null ? timeout : Duration.ofMinutes(20), pollCallback);
            LOG.info("[findAndTrigger] Run " + result.runId() + " completed: " + result.resultState());
            return result;
        }

        long runId = trigger(resolvedId, params);
        LOG.info("[findAndTrigger] Run " + runId + " triggered (fire-and-forget)");
        return getRunResult(runId);
    }

    public RunResult findAndTrigger(Long jobId, String jobName, TriggerParams params, boolean wait) {
        return findAndTrigger(jobId, jobName, params, wait, Duration.ofMinutes(20), null);
    }

    public RunResult findAndTrigger(String jobName) {
        return findAndTrigger(null, jobName, null, false, null, null);
    }
}
