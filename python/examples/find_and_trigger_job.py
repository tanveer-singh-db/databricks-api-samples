"""Example: Find a job by name (exact or partial) and trigger it.

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars
"""

from datetime import timedelta

from databricks_workspace_client import (
    AmbiguousJobError,
    DatabricksWorkspaceClient,
    ResourceNotFoundError,
)

client = DatabricksWorkspaceClient()

# Fire-and-forget by exact name
try:
    result = client.jobs.find_and_trigger(
        job_name="etl-daily",
        notebook_params={"env": "staging"},
    )
    print(f"Triggered run {result.run_id} — state: {result.life_cycle_state}")
except ResourceNotFoundError:
    print("No job found matching 'etl-daily'")
except AmbiguousJobError as e:
    print(f"Multiple matches:\n{e}")

# Wait for completion using a partial name
try:
    result = client.jobs.find_and_trigger(
        job_name="etl",  # partial match
        wait=True,
        timeout=timedelta(minutes=30),
        poll_callback=lambda s: print(f"  [{s.life_cycle_state}] {s.state_message or ''}"),
    )
    print(f"\nCompleted: {result.result_state} (run {result.run_id})")
except AmbiguousJobError as e:
    print(f"Ambiguous match — narrow your search:\n{e}")

# Trigger by job_id (skips name resolution)
result = client.jobs.find_and_trigger(job_id=123, wait=False)
print(f"Run {result.run_id}: {result.life_cycle_state}")
