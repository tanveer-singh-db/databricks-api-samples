/**
 * Example: Trigger a job and wait for completion with progress callbacks.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Know the job_id of the job you want to trigger
 */

import {
  DatabricksWorkspaceClient,
  JobRunError,
  OperationTimeoutError,
} from "../src/index.ts";

const client = new DatabricksWorkspaceClient();
const JOB_ID = 123; // Replace with your job ID

try {
  console.log(`Triggering job ${JOB_ID} and waiting for completion...`);
  const result = await client.jobs.triggerAndWait(JOB_ID, {
    notebookParams: { env: "prod" },
    timeoutMs: 30 * 60 * 1000, // 30 minutes
    pollIntervalMs: 10_000,
    pollCallback: (status) => {
      console.log(`  [${status.lifecycleState}] ${status.stateMessage ?? ""}`);
    },
  });

  console.log("\nJob completed successfully!");
  console.log(`  Run ID:   ${result.runId}`);
  console.log(`  Duration: ${result.runDuration}ms`);
  console.log(`  URL:      ${result.runPageUrl}`);
} catch (err) {
  if (err instanceof OperationTimeoutError) {
    console.log("\nJob did not complete within 30 minutes.");
  } else if (err instanceof JobRunError) {
    console.log(`\nJob failed: ${err.message}`);
    console.log(`  Details: ${JSON.stringify(err.details)}`);
  } else {
    throw err;
  }
}
