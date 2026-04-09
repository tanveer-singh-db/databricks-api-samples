/**
 * Example: Execute SQL queries against a Databricks SQL warehouse.
 *
 * Prerequisites:
 *   - Set DATABRICKS_HOST and authentication env vars
 *   - Have a running SQL warehouse
 */

import { DatabricksWorkspaceClient, QueryExecutionError } from "../src/index.ts";

const client = new DatabricksWorkspaceClient();
const WAREHOUSE_ID = "abc123def456"; // Replace with your warehouse ID

// Simple query
console.log("=== Simple query ===");
const result = await client.sql.executeQuery(
  "SELECT current_timestamp() AS now, 1 + 1 AS answer",
  WAREHOUSE_ID,
);
console.log(`Columns: ${result.columns.map((c) => c.name).join(", ")}`);
for (const row of result.rows) {
  console.log(`  ${row.join(" | ")}`);
}

// Parameterized query
console.log("\n=== Parameterized query ===");
const result2 = await client.sql.executeQuery(
  "SELECT * FROM samples.nyctaxi.trips LIMIT :limit",
  WAREHOUSE_ID,
  {
    catalog: "samples",
    schema: "nyctaxi",
    parameters: [{ name: "limit", value: "5", type: "INT" }],
  },
);
console.log(`Total rows: ${result2.totalRowCount}`);
for (const row of result2.rows) {
  console.log(`  ${row.join(" | ")}`);
}

// Lazy iteration for large results
console.log("\n=== Lazy iteration (chunk by chunk) ===");
let chunkNum = 0;
for await (const chunk of client.sql.executeQueryLazy(
  "SELECT * FROM samples.nyctaxi.trips LIMIT 1000",
  WAREHOUSE_ID,
)) {
  chunkNum++;
  console.log(`  Chunk ${chunkNum}: ${chunk.length} rows`);
}

// Error handling
console.log("\n=== Error handling ===");
try {
  await client.sql.executeQuery("SELCT bad syntax", WAREHOUSE_ID);
} catch (err) {
  if (err instanceof QueryExecutionError) {
    console.log(`Query failed: ${err.message}`);
  } else {
    throw err;
  }
}
