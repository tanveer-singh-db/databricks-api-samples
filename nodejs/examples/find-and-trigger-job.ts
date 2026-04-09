/**
 * Example: Find a job by name (exact or partial) and trigger it.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Node.js >= 18
 */

import {
  DatabricksWorkspaceClient,
  AmbiguousJobError,
  ResourceNotFoundError,
} from "../src/index.ts";

const client = new DatabricksWorkspaceClient();
const job_name = 'jb_send_email_job_notification'
// Fire-and-forget by exact name
try {

  const result = await client.jobs.findAndTrigger({
    jobName: job_name,
    jobParameters: { env: "staging" },
// # or notebookParams : { env: "staging" }
  });
  console.log(`Triggered run ${result.runId} — state: ${result.lifecycleState}`);
} catch (err) {
  if (err instanceof ResourceNotFoundError) {
    console.log(`No job found matching: ${job_name}'`);
  } else if (err instanceof AmbiguousJobError) {
    console.log(`Multiple matches:\n${err.message}`);
  } else {
    throw err;
  }
}

// Wait for completion using a partial name
try {
  const result = await client.jobs.findAndTrigger({
    jobName: job_name, // partial match
    wait: true,
    timeoutMs: 30 * 60 * 1000,
    pollCallback: (s) =>
      console.log(`  [${s.lifecycleState}] ${s.stateMessage ?? ""}`),
  });
  console.log(`\nCompleted: ${result.resultState} (run ${result.runId})`);
} catch (err) {
  if (err instanceof AmbiguousJobError) {
    console.log(`Ambiguous match — narrow your search:\n${err.message}`);
  } else {
    throw err;
  }
}

// // Trigger by jobId (skips name resolution)
// const result = await client.jobs.findAndTrigger({ jobId: 123 });
// console.log(`Run ${result.runId}: ${result.lifecycleState}`);
