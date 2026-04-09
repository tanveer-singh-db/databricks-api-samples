"""Example: Trigger a Databricks job and get the run_id.

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars
    - Know the job_id of the job you want to trigger
"""

from databricks_workspace_client import DatabricksWorkspaceClient, ResourceNotFoundError

client = DatabricksWorkspaceClient()

JOB_ID = 123  # Replace with your job ID

try:
    # Trigger with notebook parameters
    run_id = client.jobs.trigger(
        job_id=JOB_ID,
        notebook_params={"env": "staging", "date": "2025-01-01"},
    )
    print(f"Job {JOB_ID} triggered successfully. Run ID: {run_id}")

    # Or trigger with job-level parameters (Databricks Jobs v2.1+)
    # run_id = client.jobs.trigger(
    #     job_id=JOB_ID,
    #     job_parameters={"env": "staging", "date": "2025-01-01"},
    # )

except ResourceNotFoundError:
    print(f"Job {JOB_ID} not found. Check the job ID.")
