/**
 * Jobs API client — list, trigger, poll, and wait for Databricks job runs.
 *
 * Uses direct REST API calls via IHttpClient (no SDK).
 */

import type { IHttpClient } from "./http.ts";
import {
  AmbiguousJobError,
  DatabricksClientError,
  JobRunError,
  OperationTimeoutError,
  ResourceNotFoundError,
} from "./exceptions.ts";
import { JobInfo, RunResult, RunStatus } from "./models.ts";

// ─── Internal API response types (snake_case from REST API) ───────

interface ApiJobSettings {
  name?: string;
  tags?: Record<string, string>;
}

interface ApiJob {
  job_id?: number;
  settings?: ApiJobSettings;
  created_time?: number;
  creator_user_name?: string;
}

interface ApiJobsListResponse {
  jobs?: ApiJob[];
  has_more?: boolean;
  next_page_token?: string;
}

interface ApiRunState {
  life_cycle_state?: string;
  result_state?: string;
  state_message?: string;
}

interface ApiRun {
  run_id?: number;
  state?: ApiRunState;
  start_time?: number;
  end_time?: number;
  execution_duration?: number;
  run_page_url?: string;
}

interface ApiRunNowResponse {
  run_id?: number;
}

// ─── Mappers ──────────────────────────────────────────────────────

function mapJob(job: ApiJob): JobInfo {
  return new JobInfo({
    jobId: job.job_id ?? 0,
    name: job.settings?.name ?? "",
    createdTime: job.created_time ?? null,
    creator: job.creator_user_name ?? null,
    tags: job.settings?.tags ?? {},
  });
}

function mapRunStatus(run: ApiRun): RunStatus {
  return new RunStatus({
    runId: run.run_id ?? 0,
    lifecycleState: run.state?.life_cycle_state ?? "",
    resultState: run.state?.result_state ?? null,
    stateMessage: run.state?.state_message ?? null,
  });
}

function mapRunResult(run: ApiRun): RunResult {
  return new RunResult({
    runId: run.run_id ?? 0,
    lifecycleState: run.state?.life_cycle_state ?? "",
    resultState: run.state?.result_state ?? null,
    stateMessage: run.state?.state_message ?? null,
    startTime: run.start_time ?? null,
    endTime: run.end_time ?? null,
    runDuration: run.execution_duration ?? null,
    runPageUrl: run.run_page_url ?? null,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ───────────────────────────────────────────────────

export interface TriggerOptions {
  notebookParams?: Record<string, string>;
  jobParameters?: Record<string, string>;
  pythonParams?: string[];
  pythonNamedParams?: Record<string, string>;
  jarParams?: string[];
  sqlParams?: Record<string, string>;
  idempotencyToken?: string;
}

export interface FindAndTriggerOptions extends TriggerOptions {
  jobId?: number;
  jobName?: string;
  wait?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
  pollCallback?: (status: RunStatus) => void;
}

export interface TriggerAndWaitOptions extends TriggerOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  pollCallback?: (status: RunStatus) => void;
}

export class JobsClient {
  _http: IHttpClient;

  constructor(http: IHttpClient) {
    this._http = http;
  }

  async listJobs(options?: {
    name?: string;
    expandTasks?: boolean;
    limit?: number;
  }): Promise<JobInfo[]> {
    const allJobs: JobInfo[] = [];
    let pageToken: string | undefined;
    const limit = options?.limit;

    do {
      const params: Record<string, string> = {};
      if (options?.name) params.name = options.name;
      if (options?.expandTasks) params.expand_tasks = "true";
      params.limit = "25";
      if (pageToken) params.page_token = pageToken;

      const resp =
        await this._http.get<ApiJobsListResponse>("/api/2.1/jobs/list", params);

      if (resp.jobs) {
        for (const job of resp.jobs) {
          allJobs.push(mapJob(job));
          if (limit !== undefined && allJobs.length >= limit) {
            return allJobs.slice(0, limit);
          }
        }
      }

      pageToken = resp.has_more ? resp.next_page_token : undefined;
    } while (pageToken);

    return allJobs;
  }

  async trigger(jobId: number, options?: TriggerOptions): Promise<number> {
    const body: Record<string, unknown> = { job_id: jobId };
    if (options?.notebookParams) body.notebook_params = options.notebookParams;
    if (options?.jobParameters) body.job_parameters = options.jobParameters;
    if (options?.pythonParams) body.python_params = options.pythonParams;
    if (options?.pythonNamedParams)
      body.python_named_params = options.pythonNamedParams;
    if (options?.jarParams) body.jar_params = options.jarParams;
    if (options?.sqlParams) body.sql_params = options.sqlParams;
    if (options?.idempotencyToken)
      body.idempotency_token = options.idempotencyToken;

    const resp = await this._http.post<ApiRunNowResponse>(
      "/api/2.1/jobs/run-now",
      body,
    );
    return resp.run_id ?? 0;
  }

  async getRunStatus(runId: number): Promise<RunStatus> {
    const run = await this._http.get<ApiRun>("/api/2.1/jobs/runs/get", {
      run_id: String(runId),
    });
    return mapRunStatus(run);
  }

  async getRunResult(runId: number): Promise<RunResult> {
    const run = await this._http.get<ApiRun>("/api/2.1/jobs/runs/get", {
      run_id: String(runId),
    });
    return mapRunResult(run);
  }

  async triggerAndWait(
    jobId: number,
    options?: TriggerAndWaitOptions,
  ): Promise<RunResult> {
    const timeoutMs = options?.timeoutMs ?? 1_200_000; // 20 minutes
    const pollIntervalMs = options?.pollIntervalMs ?? 10_000; // 10 seconds

    const runId = await this.trigger(jobId, options);
    const deadline = Date.now() + timeoutMs;

    while (true) {
      await delay(pollIntervalMs);

      if (Date.now() > deadline) {
        throw new OperationTimeoutError(
          `Job ${jobId} run ${runId} did not complete within ${timeoutMs}ms`,
          { details: { jobId, runId, timeoutMs } },
        );
      }

      const status = await this.getRunStatus(runId);

      if (options?.pollCallback) {
        options.pollCallback(status);
      }

      if (status.isTerminal) {
        const result = await this.getRunResult(runId);

        if (result.resultState && result.resultState !== "SUCCESS") {
          throw new JobRunError(
            `Job ${jobId} run ${runId} finished with state ${result.resultState}: ${result.stateMessage}`,
            {
              details: {
                jobId,
                runId,
                resultState: result.resultState,
              },
            },
          );
        }

        return result;
      }
    }
  }

  async _resolveJob(options: {
    jobId?: number;
    jobName?: string;
  }): Promise<number> {
    if (options.jobId !== undefined) {
      console.log(`[findAndTrigger] Using job_id=${options.jobId} directly`);
      return options.jobId;
    }

    if (options.jobName === undefined) {
      throw new DatabricksClientError(
        "Either jobId or jobName must be provided",
      );
    }

    const jobName = options.jobName;

    // 1. Try exact match (API-side)
    console.log(`[findAndTrigger] Searching for job with exact name: '${jobName}'`);
    const exactMatches = await this.listJobs({ name: jobName });
    if (exactMatches.length === 1) {
      console.log(`[findAndTrigger] Exact match found: [${exactMatches[0].jobId}] ${exactMatches[0].name}`);
      return exactMatches[0].jobId;
    }
    if (exactMatches.length > 1) {
      this._throwAmbiguous(jobName, exactMatches);
    }

    // 2. Partial match (client-side, capped at 1000 jobs)
    console.log(`[findAndTrigger] No exact match. Searching partial match across workspace jobs...`);
    const allJobs = await this.listJobs({ limit: 1000 });
    const needle = jobName.toLowerCase();
    const partial = allJobs.filter((j) =>
      j.name.toLowerCase().includes(needle),
    );

    if (partial.length === 0) {
      throw new ResourceNotFoundError(
        `No job found matching '${jobName}' (searched ${allJobs.length} jobs)`,
        { details: { jobName, jobsSearched: allJobs.length } },
      );
    }
    if (partial.length === 1) {
      console.log(`[findAndTrigger] Partial match found: [${partial[0].jobId}] ${partial[0].name}`);
      return partial[0].jobId;
    }

    this._throwAmbiguous(jobName, partial);
  }

  _throwAmbiguous(jobName: string, matches: JobInfo[]): never {
    const jobList = matches
      .map((j) => `  [${j.jobId}] ${j.name}`)
      .join("\n");
    throw new AmbiguousJobError(
      `Job name '${jobName}' matched ${matches.length} jobs:\n${jobList}\n` +
        `Please provide a more specific name or use jobId.`,
      {
        details: {
          jobName,
          matches: matches.map((j) => ({ jobId: j.jobId, name: j.name })),
        },
      },
    );
  }

  async findAndTrigger(options: FindAndTriggerOptions): Promise<RunResult> {
    const resolvedId = await this._resolveJob({
      jobId: options.jobId,
      jobName: options.jobName,
    });

    const triggerOpts: TriggerOptions = {};
    if (options.notebookParams) triggerOpts.notebookParams = options.notebookParams;
    if (options.jobParameters) triggerOpts.jobParameters = options.jobParameters;
    if (options.pythonParams) triggerOpts.pythonParams = options.pythonParams;
    if (options.pythonNamedParams) triggerOpts.pythonNamedParams = options.pythonNamedParams;
    if (options.jarParams) triggerOpts.jarParams = options.jarParams;
    if (options.sqlParams) triggerOpts.sqlParams = options.sqlParams;
    if (options.idempotencyToken) triggerOpts.idempotencyToken = options.idempotencyToken;

    console.log(`[findAndTrigger] Triggering job_id=${resolvedId} (wait=${options.wait ?? false})`);

    if (options.wait) {
      const result = await this.triggerAndWait(resolvedId, {
        ...triggerOpts,
        timeoutMs: options.timeoutMs,
        pollIntervalMs: options.pollIntervalMs,
        pollCallback: options.pollCallback,
      });
      console.log(`[findAndTrigger] Run ${result.runId} completed: ${result.resultState}`);
      return result;
    }

    const runId = await this.trigger(resolvedId, triggerOpts);
    console.log(`[findAndTrigger] Run ${runId} triggered (fire-and-forget)`);
    return this.getRunResult(runId);
  }
}
