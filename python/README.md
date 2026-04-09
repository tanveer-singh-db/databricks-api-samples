# Databricks Workspace Client — Python

A clean wrapper around the official `databricks-sdk` for common workspace operations.

## Installation

```bash
cd python/
pip install -e ".[dev]"
```

Requires Python >= 3.10.

## Quick Start

```python
from databricks_workspace_client import DatabricksWorkspaceClient

# Uses DATABRICKS_HOST + DATABRICKS_TOKEN env vars (or any unified auth method)
client = DatabricksWorkspaceClient()

# List jobs
jobs = client.jobs.list_jobs(name="etl", limit=10)

# Trigger a job
run_id = client.jobs.trigger(job_id=123, notebook_params={"env": "prod"})

# Wait for completion with progress
from datetime import timedelta
result = client.jobs.trigger_and_wait(
    job_id=123,
    timeout=timedelta(minutes=30),
    poll_callback=lambda s: print(f"{s.life_cycle_state}: {s.state_message}"),
)

# Find a job by name and trigger it
result = client.jobs.find_and_trigger(job_name="etl", wait=True)

# Execute SQL
result = client.sql.execute_query("SELECT 1 AS x", warehouse_id="abc123")
```

## Project Structure

```
python/
├── pyproject.toml
├── src/databricks_workspace_client/
│   ├── __init__.py       # Public API exports
│   ├── client.py         # DatabricksWorkspaceClient facade
│   ├── auth.py           # AuthConfig + factory
│   ├── jobs.py           # JobsClient
│   ├── sql.py            # SqlClient
│   ├── models.py         # Data models (JobInfo, RunStatus, QueryResult, etc.)
│   └── exceptions.py     # Custom exceptions
├── tests/                # Unit tests (mocked, no workspace needed)
└── examples/             # Runnable example scripts
```

## Running Tests

```bash
pytest -v
```

## Linting

```bash
ruff check src/ tests/
```

## Documentation

- [Authentication Guide](../docs/authentication.md)
- [Jobs API Guide](../docs/jobs-api.md)
- [SQL Execution Guide](../docs/sql-api.md)
