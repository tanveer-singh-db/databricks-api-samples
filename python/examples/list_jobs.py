"""Example: List and search for jobs in a Databricks workspace.

Prerequisites:
    - Set DATABRICKS_HOST and authentication env vars (token, OAuth, or Azure CLI)
    - pip install databricks-workspace-client
"""

from databricks_workspace_client import DatabricksWorkspaceClient

client = DatabricksWorkspaceClient()

# List all jobs (first 10)
print("=== First 10 jobs ===")
jobs = client.jobs.list_jobs(limit=10)
for job in jobs:
    print(f"  [{job.job_id}] {job.name} (created by: {job.creator})")

# Search by name
print("\n=== Search by name ===")
etl_jobs = client.jobs.list_jobs(name="etl")
for job in etl_jobs:
    print(f"  [{job.job_id}] {job.name}")

if not etl_jobs:
    print("  No jobs found matching 'etl'")
