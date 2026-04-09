# Jobs API Guide

Operations for listing, triggering, and monitoring Databricks jobs.

> **Official docs:** [Jobs API reference](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs) | [Jobs concepts](https://learn.microsoft.com/en-us/azure/databricks/jobs) | [Manage job runs](https://learn.microsoft.com/en-us/azure/databricks/jobs/run-now)

## List Jobs

Lists jobs in the workspace. See [Jobs API — List](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/list).

**Python:**
```python
from databricks_workspace_client import DatabricksWorkspaceClient
client = DatabricksWorkspaceClient()

all_jobs = client.jobs.list_jobs()
etl_jobs = client.jobs.list_jobs(name="etl-daily")
first_five = client.jobs.list_jobs(limit=5)
```

**Node.js:**
```typescript
import { DatabricksWorkspaceClient } from "databricks-workspace-client";
const client = new DatabricksWorkspaceClient();

const allJobs = await client.jobs.listJobs();
const etlJobs = await client.jobs.listJobs({ name: "etl-daily" });
const firstFive = await client.jobs.listJobs({ limit: 5 });
```

Each job is returned as a `JobInfo` with fields: `jobId`/`job_id`, `name`, `createdTime`/`created_time`, `creator`, `tags`.

## Trigger a Job

Fire-and-forget — returns the `run_id` immediately without waiting. See [Jobs API — Run Now](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/runnow).

**Python:**
```python
run_id = client.jobs.trigger(job_id=123, notebook_params={"env": "prod"})
```

**Node.js:**
```typescript
const runId = await client.jobs.trigger(123, { notebookParams: { env: "prod" } });
```

Supported parameter types (see [Run Now parameters](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/runnow#request)):
- `job_parameters` — job-level parameters ([Jobs API v2.1+](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/runnow#job_parameters), **recommended**)
- `notebook_params` — for notebook tasks (legacy)
- `python_params` / `python_named_params` — for Python tasks
- `jar_params` — for JAR tasks
- `sql_params` — for SQL tasks
- `idempotency_token` — ensures at-most-once execution

## Check Run Status

Single poll — returns the current state without waiting. See [Jobs API — Get Run](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/getrun).

```python
status = client.jobs.get_run_status(run_id=run_id)
print(f"State: {status.life_cycle_state}")  # PENDING, RUNNING, TERMINATED, etc.
print(f"Terminal: {status.is_terminal}")
```

`RunStatus` fields: `run_id`, `life_cycle_state`, `result_state`, `state_message`, `is_terminal`.

## Get Full Run Result

```python
result = client.jobs.get_run_result(run_id=run_id)
print(f"Result: {result.result_state}")    # SUCCESS, FAILED
print(f"Duration: {result.run_duration}ms")
print(f"URL: {result.run_page_url}")
```

## Trigger and Wait (Blocking)

Trigger a job and block until it finishes, with optional progress callbacks.

**Python:**
```python
from datetime import timedelta

result = client.jobs.trigger_and_wait(
    job_id=123,
    notebook_params={"env": "prod"},
    timeout=timedelta(minutes=30),
    poll_callback=lambda s: print(f"  {s.life_cycle_state}: {s.state_message}"),
)
```

**Node.js:**
```typescript
const result = await client.jobs.triggerAndWait(123, {
  notebookParams: { env: "prod" },
  timeoutMs: 30 * 60 * 1000,
  pollCallback: (s) => console.log(`  ${s.lifecycleState}: ${s.stateMessage}`),
});
```

This method:
- Polls periodically until a terminal state is reached
- Raises/throws `OperationTimeoutError` if the timeout is exceeded
- Raises/throws `JobRunError` if the run terminates with a non-SUCCESS state
- Calls `pollCallback`/`poll_callback` with a `RunStatus` between each poll interval

## Find and Trigger

Resolve a job by ID, exact name, or partial name — then trigger it in one call.

**Python:**
```python
# By exact name, fire-and-forget
result = client.jobs.find_and_trigger(job_name="etl-daily", notebook_params={"env": "prod"})

# By partial name, wait for completion
result = client.jobs.find_and_trigger(
    job_name="etl",  # matches "my-etl-pipeline"
    wait=True,
    timeout=timedelta(minutes=30),
)

# By job_id (skips name resolution)
result = client.jobs.find_and_trigger(job_id=123, wait=True)
```

**Node.js:**
```typescript
// By exact name, fire-and-forget
const result = await client.jobs.findAndTrigger({
  jobName: "etl-daily",
  notebookParams: { env: "prod" },
});

// By partial name, wait for completion
const result = await client.jobs.findAndTrigger({
  jobName: "etl",
  wait: true,
  timeoutMs: 30 * 60 * 1000,
});

// By job_id (skips name resolution)
const result = await client.jobs.findAndTrigger({ jobId: 123, wait: true });
```

**Resolution order:** exact name match (API-side) → partial substring match (client-side).

Throws `AmbiguousJobError` if multiple jobs match — the error message lists all matches with their IDs so you can disambiguate.

## Error Handling

```python
from databricks_workspace_client import (
    ResourceNotFoundError,
    PermissionDeniedError,
    JobRunError,
    OperationTimeoutError,
    AmbiguousJobError,
)

try:
    result = client.jobs.find_and_trigger(job_name="etl", wait=True)
except ResourceNotFoundError:
    print("Job not found")
except AmbiguousJobError as e:
    print(f"Multiple matches — be more specific:\n{e}")
except PermissionDeniedError:
    print("No permission to trigger this job")
except OperationTimeoutError:
    print("Job didn't finish in time")
except JobRunError as e:
    print(f"Job failed: {e.details['result_state']}")
```

## Lifecycle States Reference

See [Run lifecycle](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs/getrun#RunLifeCycleState).

| State | Terminal? | Description |
|-------|-----------|-------------|
| `PENDING` | No | Queued or waiting for resources |
| `RUNNING` | No | Actively executing |
| `TERMINATING` | No | Finishing up |
| `TERMINATED` | Yes | Completed (check `result_state`) |
| `SKIPPED` | Yes | Skipped (e.g., duplicate run) |
| `INTERNAL_ERROR` | Yes | Platform error |

## Further Reading

- [Create and manage Databricks jobs](https://learn.microsoft.com/en-us/azure/databricks/jobs)
- [Jobs API 2.1 reference](https://learn.microsoft.com/en-us/azure/databricks/api/workspace/jobs)
- [Databricks SDK for Python — Jobs](https://databricks-sdk-py.readthedocs.io/en/latest/workspace/jobs/jobs.html)
