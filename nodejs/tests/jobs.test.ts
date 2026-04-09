import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobsClient } from "../src/jobs.ts";
import type { IHttpClient } from "../src/http.ts";
import {
  AmbiguousJobError,
  DatabricksClientError,
  JobRunError,
  OperationTimeoutError,
  ResourceNotFoundError,
} from "../src/exceptions.ts";

function createMockHttp(handlers: {
  get?: (path: string, params?: Record<string, string>) => Promise<unknown>;
  post?: (path: string, body?: unknown) => Promise<unknown>;
}): IHttpClient {
  return {
    async get<T>(path: string, params?: Record<string, string>): Promise<T> {
      return (handlers.get?.(path, params) ?? {}) as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      return (handlers.post?.(path, body) ?? {}) as T;
    },
  };
}

describe("JobsClient.listJobs", () => {
  it("returns mapped JobInfo objects", async () => {
    const http = createMockHttp({
      get: async () => ({
        jobs: [
          { job_id: 1, settings: { name: "etl-daily" }, created_time: 1700000000, creator_user_name: "user@example.com" },
          { job_id: 2, settings: { name: "ml-training" }, creator_user_name: null },
        ],
        has_more: false,
      }),
    });
    const client = new JobsClient(http);
    const jobs = await client.listJobs();
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].jobId, 1);
    assert.equal(jobs[0].name, "etl-daily");
    assert.equal(jobs[0].creator, "user@example.com");
    assert.equal(jobs[1].jobId, 2);
  });

  it("passes name filter to API", async () => {
    let capturedParams: Record<string, string> | undefined;
    const http = createMockHttp({
      get: async (_path, params) => {
        capturedParams = params;
        return { jobs: [], has_more: false };
      },
    });
    const client = new JobsClient(http);
    await client.listJobs({ name: "etl" });
    assert.equal(capturedParams?.name, "etl");
  });

  it("respects limit", async () => {
    const http = createMockHttp({
      get: async () => ({
        jobs: Array.from({ length: 10 }, (_, i) => ({
          job_id: i, settings: { name: `job-${i}` },
        })),
        has_more: false,
      }),
    });
    const client = new JobsClient(http);
    const jobs = await client.listJobs({ limit: 3 });
    assert.equal(jobs.length, 3);
  });

  it("handles pagination", async () => {
    let callCount = 0;
    const http = createMockHttp({
      get: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            jobs: [{ job_id: 1, settings: { name: "a" } }],
            has_more: true,
            next_page_token: "page2",
          };
        }
        return {
          jobs: [{ job_id: 2, settings: { name: "b" } }],
          has_more: false,
        };
      },
    });
    const client = new JobsClient(http);
    const jobs = await client.listJobs();
    assert.equal(jobs.length, 2);
    assert.equal(callCount, 2);
  });
});

describe("JobsClient.trigger", () => {
  it("returns run_id", async () => {
    const http = createMockHttp({
      post: async () => ({ run_id: 42 }),
    });
    const client = new JobsClient(http);
    const runId = await client.trigger(123, { notebookParams: { key: "val" } });
    assert.equal(runId, 42);
  });

  it("sends correct request body", async () => {
    let capturedBody: unknown;
    const http = createMockHttp({
      post: async (_path, body) => {
        capturedBody = body;
        return { run_id: 1 };
      },
    });
    const client = new JobsClient(http);
    await client.trigger(123, {
      notebookParams: { env: "prod" },
      idempotencyToken: "token-1",
    });
    const body = capturedBody as Record<string, unknown>;
    assert.equal(body.job_id, 123);
    assert.deepEqual(body.notebook_params, { env: "prod" });
    assert.equal(body.idempotency_token, "token-1");
  });
});

describe("JobsClient.getRunStatus", () => {
  it("returns mapped RunStatus", async () => {
    const http = createMockHttp({
      get: async () => ({
        run_id: 42,
        state: { life_cycle_state: "RUNNING", state_message: "running tasks" },
      }),
    });
    const client = new JobsClient(http);
    const status = await client.getRunStatus(42);
    assert.equal(status.runId, 42);
    assert.equal(status.lifecycleState, "RUNNING");
    assert.equal(status.isTerminal, false);
  });

  it("detects terminal state", async () => {
    const http = createMockHttp({
      get: async () => ({
        run_id: 42,
        state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" },
      }),
    });
    const client = new JobsClient(http);
    const status = await client.getRunStatus(42);
    assert.equal(status.isTerminal, true);
    assert.equal(status.resultState, "SUCCESS");
  });
});

describe("JobsClient.getRunResult", () => {
  it("returns full RunResult", async () => {
    const http = createMockHttp({
      get: async () => ({
        run_id: 42,
        state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" },
        start_time: 1700000000,
        end_time: 1700000060,
        execution_duration: 60000,
        run_page_url: "https://ws.com/jobs/1/runs/42",
      }),
    });
    const client = new JobsClient(http);
    const result = await client.getRunResult(42);
    assert.equal(result.runId, 42);
    assert.equal(result.startTime, 1700000000);
    assert.equal(result.runDuration, 60000);
    assert.equal(result.runPageUrl, "https://ws.com/jobs/1/runs/42");
    assert.equal(result.isSuccess, true);
  });
});

describe("JobsClient.triggerAndWait", () => {
  it("returns result on success", async () => {
    let getCount = 0;
    const http = createMockHttp({
      post: async () => ({ run_id: 42 }),
      get: async () => {
        getCount++;
        if (getCount <= 1) {
          return { run_id: 42, state: { life_cycle_state: "RUNNING" } };
        }
        return {
          run_id: 42,
          state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" },
          start_time: 100, end_time: 200, execution_duration: 100,
        };
      },
    });
    const client = new JobsClient(http);
    const result = await client.triggerAndWait(1, { pollIntervalMs: 1 });
    assert.equal(result.runId, 42);
    assert.equal(result.isSuccess, true);
  });

  it("throws OperationTimeoutError on timeout", async () => {
    const http = createMockHttp({
      post: async () => ({ run_id: 42 }),
      get: async () => ({
        run_id: 42,
        state: { life_cycle_state: "RUNNING" },
      }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client.triggerAndWait(1, { timeoutMs: 50, pollIntervalMs: 10 }),
      (err: Error) => err instanceof OperationTimeoutError,
    );
  });

  it("throws JobRunError on failure", async () => {
    const http = createMockHttp({
      post: async () => ({ run_id: 42 }),
      get: async () => ({
        run_id: 42,
        state: { life_cycle_state: "TERMINATED", result_state: "FAILED", state_message: "OOM" },
      }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client.triggerAndWait(1, { pollIntervalMs: 1 }),
      (err: Error) => err instanceof JobRunError && err.message.includes("FAILED"),
    );
  });

  it("calls pollCallback with RunStatus", async () => {
    let getCount = 0;
    const http = createMockHttp({
      post: async () => ({ run_id: 42 }),
      get: async () => {
        getCount++;
        if (getCount <= 2) {
          return { run_id: 42, state: { life_cycle_state: "RUNNING" } };
        }
        return {
          run_id: 42,
          state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" },
        };
      },
    });

    const states: string[] = [];
    const client = new JobsClient(http);
    await client.triggerAndWait(1, {
      pollIntervalMs: 1,
      pollCallback: (s) => states.push(s.lifecycleState),
    });
    assert.ok(states.includes("RUNNING"));
    assert.ok(states.includes("TERMINATED"));
  });
});

// ─── _resolveJob tests ──────────────────────────────────────────

describe("JobsClient._resolveJob", () => {
  it("returns jobId directly when provided", async () => {
    const http = createMockHttp({});
    const client = new JobsClient(http);
    const id = await client._resolveJob({ jobId: 42 });
    assert.equal(id, 42);
  });

  it("resolves exact name match", async () => {
    const http = createMockHttp({
      get: async () => ({
        jobs: [{ job_id: 10, settings: { name: "etl-daily" } }],
        has_more: false,
      }),
    });
    const client = new JobsClient(http);
    const id = await client._resolveJob({ jobName: "etl-daily" });
    assert.equal(id, 10);
  });

  it("resolves partial name match when exact fails", async () => {
    let callCount = 0;
    const http = createMockHttp({
      get: async () => {
        callCount++;
        if (callCount === 1) return { jobs: [], has_more: false }; // exact match empty
        return {
          jobs: [
            { job_id: 1, settings: { name: "other" } },
            { job_id: 2, settings: { name: "my-etl-pipeline" } },
          ],
          has_more: false,
        };
      },
    });
    const client = new JobsClient(http);
    const id = await client._resolveJob({ jobName: "etl" });
    assert.equal(id, 2);
  });

  it("throws ResourceNotFoundError when no match", async () => {
    const http = createMockHttp({
      get: async () => ({ jobs: [], has_more: false }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client._resolveJob({ jobName: "ghost" }),
      (err: Error) => err instanceof ResourceNotFoundError,
    );
  });

  it("throws AmbiguousJobError on multiple exact matches", async () => {
    const http = createMockHttp({
      get: async () => ({
        jobs: [
          { job_id: 1, settings: { name: "etl-daily" } },
          { job_id: 2, settings: { name: "etl-daily" } },
        ],
        has_more: false,
      }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client._resolveJob({ jobName: "etl-daily" }),
      (err: Error) => err instanceof AmbiguousJobError && err.message.includes("matched 2"),
    );
  });

  it("throws AmbiguousJobError on multiple partial matches", async () => {
    let callCount = 0;
    const http = createMockHttp({
      get: async () => {
        callCount++;
        if (callCount === 1) return { jobs: [], has_more: false };
        return {
          jobs: [
            { job_id: 1, settings: { name: "etl-v1" } },
            { job_id: 2, settings: { name: "etl-v2" } },
            { job_id: 3, settings: { name: "etl-v3" } },
          ],
          has_more: false,
        };
      },
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client._resolveJob({ jobName: "etl" }),
      (err: Error) => {
        if (!(err instanceof AmbiguousJobError)) return false;
        const matches = err.details.matches as Array<{ jobId: number }>;
        return matches.length === 3;
      },
    );
  });

  it("throws DatabricksClientError when neither provided", async () => {
    const http = createMockHttp({});
    const client = new JobsClient(http);
    await assert.rejects(
      () => client._resolveJob({}),
      (err: Error) => err instanceof DatabricksClientError && err.message.includes("Either"),
    );
  });
});

// ─── findAndTrigger tests ───────────────────────────────────────

describe("JobsClient.findAndTrigger", () => {
  it("fire-and-forget returns current state", async () => {
    let getCallCount = 0;
    const http = createMockHttp({
      get: async () => {
        getCallCount++;
        if (getCallCount === 1) {
          // resolve job (exact match)
          return { jobs: [{ job_id: 10, settings: { name: "my-job" } }], has_more: false };
        }
        // get_run_result
        return { run_id: 42, state: { life_cycle_state: "PENDING" } };
      },
      post: async () => ({ run_id: 42 }),
    });
    const client = new JobsClient(http);
    const result = await client.findAndTrigger({
      jobName: "my-job",
      notebookParams: { x: "1" },
    });
    assert.equal(result.runId, 42);
    assert.equal(result.lifecycleState, "PENDING");
  });

  it("wait=true delegates to triggerAndWait", async () => {
    let getCallCount = 0;
    const http = createMockHttp({
      get: async () => {
        getCallCount++;
        if (getCallCount === 1) {
          return { jobs: [{ job_id: 10, settings: { name: "my-job" } }], has_more: false };
        }
        // Poll returns terminal
        return { run_id: 42, state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" }, start_time: 100 };
      },
      post: async () => ({ run_id: 42 }),
    });
    const client = new JobsClient(http);
    const result = await client.findAndTrigger({
      jobName: "my-job",
      wait: true,
      pollIntervalMs: 1,
    });
    assert.equal(result.runId, 42);
    assert.equal(result.isSuccess, true);
  });

  it("resolves by partial name and triggers", async () => {
    let getCallCount = 0;
    const http = createMockHttp({
      get: async () => {
        getCallCount++;
        if (getCallCount === 1) return { jobs: [], has_more: false }; // exact fails
        if (getCallCount === 2) {
          return { jobs: [{ job_id: 5, settings: { name: "my-etl-pipeline" } }], has_more: false };
        }
        return { run_id: 99, state: { life_cycle_state: "RUNNING" } };
      },
      post: async () => ({ run_id: 99 }),
    });
    const client = new JobsClient(http);
    const result = await client.findAndTrigger({ jobName: "etl" });
    assert.equal(result.runId, 99);
  });

  it("uses jobId directly", async () => {
    const http = createMockHttp({
      get: async () => ({ run_id: 77, state: { life_cycle_state: "PENDING" } }),
      post: async () => ({ run_id: 77 }),
    });
    const client = new JobsClient(http);
    const result = await client.findAndTrigger({ jobId: 10 });
    assert.equal(result.runId, 77);
  });

  it("throws ResourceNotFoundError when no match", async () => {
    const http = createMockHttp({
      get: async () => ({ jobs: [], has_more: false }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client.findAndTrigger({ jobName: "ghost" }),
      (err: Error) => err instanceof ResourceNotFoundError,
    );
  });

  it("throws AmbiguousJobError on multiple matches", async () => {
    const http = createMockHttp({
      get: async () => ({
        jobs: [
          { job_id: 1, settings: { name: "etl-job" } },
          { job_id: 2, settings: { name: "etl-job" } },
        ],
        has_more: false,
      }),
    });
    const client = new JobsClient(http);
    await assert.rejects(
      () => client.findAndTrigger({ jobName: "etl-job" }),
      (err: Error) => err instanceof AmbiguousJobError,
    );
  });
});
