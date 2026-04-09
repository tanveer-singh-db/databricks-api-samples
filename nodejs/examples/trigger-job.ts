/**
 * Example: Trigger a Databricks job and get the run_id.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Know the job_id of the job you want to trigger
 */

import { DatabricksWorkspaceClient, ResourceNotFoundError } from "../src/index.ts";

const client = new DatabricksWorkspaceClient();
const JOB_ID = 123; // Replace with your job ID

try {
  const runId = await client.jobs.trigger(JOB_ID, {
    notebookParams: { env: "staging", date: "2025-01-01" },
  });
  console.log(`Job ${JOB_ID} triggered successfully. Run ID: ${runId}`);
} catch (err) {
  if (err instanceof ResourceNotFoundError) {
    console.log(`Job ${JOB_ID} not found. Check the job ID.`);
  } else {
    throw err;
  }
}
