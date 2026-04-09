/**
 * Example: Check the status of a running Databricks job.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Have a run_id from a previously triggered job
 */

import { DatabricksWorkspaceClient } from "../src/index.ts";

const client = new DatabricksWorkspaceClient();
const RUN_ID = 456; // Replace with your run ID

// Single status check
let status = await client.jobs.getRunStatus(RUN_ID);
console.log(`Run ${RUN_ID}: ${status.lifecycleState} (result: ${status.resultState})`);

// Manual polling loop
while (!status.isTerminal) {
  await new Promise((r) => setTimeout(r, 10_000));
  status = await client.jobs.getRunStatus(RUN_ID);
  console.log(`  ... ${status.lifecycleState}: ${status.stateMessage}`);
}

// Get full result once terminal
const result = await client.jobs.getRunResult(RUN_ID);
console.log(`\nFinal state: ${result.resultState}`);
console.log(`Duration: ${result.runDuration}ms`);
console.log(`URL: ${result.runPageUrl}`);
