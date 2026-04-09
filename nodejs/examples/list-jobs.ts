/**
 * Example: List and search for jobs in a Databricks workspace.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars (token, OAuth, or Azure CLI)
 *   - Node.js >= 18
 */

import { DatabricksWorkspaceClient } from "../src/index.ts";

const client = new DatabricksWorkspaceClient();

// List first 10 jobs
console.log("=== First 10 jobs ===");
const jobs = await client.jobs.listJobs({ limit: 10 });
for (const job of jobs) {
  console.log(`  [${job.jobId}] ${job.name} (created by: ${job.creator})`);
}

// Search by name
console.log("\n=== Search by name ===");
const etlJobs = await client.jobs.listJobs({ name: "jb_test" });
for (const job of etlJobs) {
  console.log(`  [${job.jobId}] ${job.name}`);
}
if (etlJobs.length === 0) {
  console.log("  No jobs found matching 'jb_test'");
}
