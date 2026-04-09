"""Example: Trigger a job and wait for completion with progress callbacks.

Uses the SDK's built-in polling mechanism via trigger_and_wait().

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars
    - Know the job_id of the job you want to trigger
"""

from datetime import timedelta

from databricks_workspace_client import (
    DatabricksWorkspaceClient,
    JobRunError,
    OperationTimeoutError,
)

client = DatabricksWorkspaceClient()

JOB_ID = 123  # Replace with your job ID


def on_progress(status):
    """Called between each poll interval with the current run status."""
    print(f"  [{status.life_cycle_state}] {status.state_message or ''}")


try:
    print(f"Triggering job {JOB_ID} and waiting for completion...")
    result = client.jobs.trigger_and_wait(
        job_id=JOB_ID,
        notebook_params={"env": "prod"},
        timeout=timedelta(minutes=30),
        poll_callback=on_progress,
    )
    print("\nJob completed successfully!")
    print(f"  Run ID:   {result.run_id}")
    print(f"  Duration: {result.run_duration}ms")
    print(f"  URL:      {result.run_page_url}")

except OperationTimeoutError:
    print("\nJob did not complete within 30 minutes.")

except JobRunError as e:
    print(f"\nJob failed: {e}")
    print(f"  Details: {e.details}")
