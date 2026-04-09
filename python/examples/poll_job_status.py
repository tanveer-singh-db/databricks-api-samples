"""Example: Check the status of a running Databricks job.

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars
    - Have a run_id from a previously triggered job
"""

import time

from databricks_workspace_client import DatabricksWorkspaceClient

client = DatabricksWorkspaceClient()

RUN_ID = 456  # Replace with your run ID

# Single status check
status = client.jobs.get_run_status(run_id=RUN_ID)
print(f"Run {RUN_ID}: {status.life_cycle_state} (result: {status.result_state})")

# Manual polling loop
while not status.is_terminal:
    time.sleep(10)
    status = client.jobs.get_run_status(run_id=RUN_ID)
    print(f"  ... {status.life_cycle_state}: {status.state_message}")

# Get full result once terminal
result = client.jobs.get_run_result(run_id=RUN_ID)
print(f"\nFinal state: {result.result_state}")
print(f"Duration: {result.run_duration}ms")
print(f"URL: {result.run_page_url}")
